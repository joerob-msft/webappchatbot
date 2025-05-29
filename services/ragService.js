const { isAzureAppService, ragTopK } = require('../config/environment');
const { conditionallyLoadTransformers } = require('../models/localModels');
const { chunkText, cosineSimilarity } = require('../utils/textUtils');
const { logSuccess, logWarning, logError } = require('../utils/logger');

// State
let embedder = null;
let documentStore = [];
let documentEmbeddings = [];

async function initializeEmbedder() {
    // Skip embedder in Azure App Service - use Azure OpenAI for everything
    if (isAzureAppService) {
        logWarning('Azure App Service detected - embedder not needed (using Azure OpenAI only)');
        return null;
    }
    
    if (embedder) return embedder;
    
    // Ensure transformers is loaded first
    const { getTransformersAvailable } = require('../models/localModels');
    if (!getTransformersAvailable()) {
        const loaded = await conditionallyLoadTransformers();
        if (!loaded) {
            logWarning('Transformers not available - embedder cannot be initialized');
            return null;
        }
    }
    
    try {
        console.log('Initializing text embedder for RAG...');
        const { pipeline } = await import('@xenova/transformers');
        embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        logSuccess('Embedder initialized successfully!');
        return embedder;
    } catch (error) {
        logError(`Failed to initialize embedder: ${error.message}`);
        return null;
    }
}

async function generateEmbedding(text) {
    if (!embedder) {
        await initializeEmbedder();
    }
    
    if (!embedder) {
        throw new Error('Embedder not available');
    }
    
    const result = await embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(result.data);
}

async function processWebsitePages(pages) {
    console.log(`\n=== PROCESSING ${pages.length} WEBSITE PAGES ===`);
    
    // Initialize embedder if needed
    if (!embedder) {
        await initializeEmbedder();
    }
    
    if (!embedder) {
        throw new Error('Embedder not available for processing website pages');
    }
    
    const processedChunks = [];
    
    for (const page of pages) {
        console.log(`Processing: ${page.title}`);
        
        // Create structured content for better chunking
        let structuredContent = `${page.title}\n\n`;
        if (page.description) {
            structuredContent += `${page.description}\n\n`;
        }
        structuredContent += page.content;
        
        // Chunk the content
        const chunks = chunkText(structuredContent, 500, 50);
        
        // Generate embeddings for each chunk
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            try {
                const embedding = await generateEmbedding(chunk);
                processedChunks.push({
                    chunk,
                    embedding,
                    source: `${page.title} (${page.url})`,
                    url: page.url,
                    title: page.title,
                    chunkIndex: i,
                    pageIndex: pages.indexOf(page),
                    type: 'website'
                });
            } catch (error) {
                logError(`Error generating embedding for chunk ${i} of ${page.title}: ${error.message}`);
            }
        }
    }
    
    logSuccess(`Processed ${processedChunks.length} chunks from ${pages.length} pages`);
    return processedChunks;
}

async function retrieveRelevantChunks(query, topK = ragTopK) {
    if (documentEmbeddings.length === 0) {
        return [];
    }
    
    const queryEmbedding = await generateEmbedding(query);
    
    const similarities = documentEmbeddings.map((docEmb, index) => ({
        index,
        similarity: cosineSimilarity(queryEmbedding, docEmb.embedding),
        chunk: docEmb.chunk,
        source: docEmb.source,
        url: docEmb.url || null,
        type: docEmb.type || 'document'
    }));
    
    return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
}

async function generateLocalResponseWithRAG(message, modelName = 'distilgpt2', useRAG = true, includeWebsiteContent = true) {
    const { generateResponseWithContext } = require('../models/localModels');
    
    let context = '';
    let sources = [];
    
    // Retrieve relevant documents if RAG is enabled
    if (useRAG && documentEmbeddings.length > 0) {
        console.log('Retrieving relevant documents for RAG...');
        
        // Filter embeddings based on preferences
        let availableEmbeddings = documentEmbeddings;
        if (!includeWebsiteContent) {
            availableEmbeddings = documentEmbeddings.filter(d => d.type !== 'website');
        }
        
        if (availableEmbeddings.length > 0) {
            const queryEmbedding = await generateEmbedding(message);
            
            const similarities = availableEmbeddings.map((docEmb, index) => ({
                index,
                similarity: cosineSimilarity(queryEmbedding, docEmb.embedding),
                chunk: docEmb.chunk,
                source: docEmb.source,
                url: docEmb.url || null,
                type: docEmb.type || 'document'
            }));
            
            const relevantChunks = similarities
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, 3);
            
            if (relevantChunks.length > 0) {
                context = relevantChunks.map(chunk => chunk.chunk).join('\n\n');
                sources = [...new Set(relevantChunks.map(chunk => chunk.source))];
                
                console.log(`Found ${relevantChunks.length} relevant chunks from: ${sources.join(', ')}`);
                console.log('Content types:', [...new Set(relevantChunks.map(c => c.type))]);
            }
        }
    }
    
    // Generate response with context
    return await generateResponseWithContext(message, context, sources, modelName);
}

async function generateAzureOpenAIResponseWithRAG(message, useRAG = true, includeWebsiteContent = true) {
    const { generateAzureOpenAIResponse, getAzureOpenAIClient } = require('../models/azureOpenAI');
    const { initializeAzureOpenAI } = require('../models/azureOpenAI');
    
    let azureOpenAIClient = getAzureOpenAIClient();
    if (!azureOpenAIClient) {
        azureOpenAIClient = initializeAzureOpenAI();
        if (!azureOpenAIClient) {
            throw new Error('Azure OpenAI client not available');
        }
    }
    
    let context = '';
    let sources = [];
    
    // In Azure App Service, skip RAG entirely if no embedder is available
    if (useRAG && documentEmbeddings.length > 0) {
        console.log('RAG requested but in Azure App Service mode - using document text directly');
        
        // For Azure App Service, use simple text matching instead of embeddings
        if (isAzureAppService) {
            console.log('Using simple text search fallback for RAG in Azure App Service');
            
            // Filter embeddings based on preferences
            let availableEmbeddings = documentEmbeddings;
            if (!includeWebsiteContent) {
                availableEmbeddings = documentEmbeddings.filter(d => d.type !== 'website');
            }
            
            if (availableEmbeddings.length > 0) {
                // Simple keyword matching as fallback
                const messageLower = message.toLowerCase();
                const matchingChunks = availableEmbeddings
                    .filter(doc => doc.chunk.toLowerCase().includes(messageLower))
                    .slice(0, 3);
                
                if (matchingChunks.length === 0) {
                    // If no keyword matches, take the first few chunks
                    const fallbackChunks = availableEmbeddings.slice(0, 3);
                    context = fallbackChunks.map(chunk => chunk.chunk).join('\n\n');
                    sources = [...new Set(fallbackChunks.map(chunk => chunk.source))];
                    console.log('Using fallback chunks for context');
                } else {
                    context = matchingChunks.map(chunk => chunk.chunk).join('\n\n');
                    sources = [...new Set(matchingChunks.map(chunk => chunk.source))];
                    console.log(`Found ${matchingChunks.length} matching chunks`);
                }
            }
        } else {
            // Local development with embedder
            console.log('Retrieving relevant documents for Azure OpenAI RAG...');
            
            // Filter embeddings based on preferences
            let availableEmbeddings = documentEmbeddings;
            if (!includeWebsiteContent) {
                availableEmbeddings = documentEmbeddings.filter(d => d.type !== 'website');
            }
            
            if (availableEmbeddings.length > 0 && embedder) {
                try {
                    const queryEmbedding = await generateEmbedding(message);
                    
                    const similarities = availableEmbeddings.map((docEmb, index) => ({
                        index,
                        similarity: cosineSimilarity(queryEmbedding, docEmb.embedding),
                        chunk: docEmb.chunk,
                        source: docEmb.source,
                        url: docEmb.url || null,
                        type: docEmb.type || 'document'
                    }));
                    
                    const relevantChunks = similarities
                        .sort((a, b) => b.similarity - a.similarity)
                        .slice(0, ragTopK);
                    
                    if (relevantChunks.length > 0) {
                        context = relevantChunks.map(chunk => chunk.chunk).join('\n\n');
                        sources = [...new Set(relevantChunks.map(chunk => chunk.source))];
                        
                        console.log(`Found ${relevantChunks.length} relevant chunks from: ${sources.join(', ')}`);
                    }
                } catch (error) {
                    logError(`RAG error: ${error.message}`);
                    console.log('📝 Continuing without RAG context...');
                }
            }
        }
    }
    
    // Generate response with Azure OpenAI (with or without context)
    return await generateAzureOpenAIResponse(message, context, sources);
}

module.exports = {
    initializeEmbedder,
    generateEmbedding,
    processWebsitePages,
    retrieveRelevantChunks,
    generateLocalResponseWithRAG,
    generateAzureOpenAIResponseWithRAG,
    getDocumentStore: () => documentStore,
    getDocumentEmbeddings: () => documentEmbeddings,
    setDocumentEmbeddings: (embeddings) => { documentEmbeddings = embeddings; },
    addToDocumentStore: (doc) => documentStore.push(doc),
    getEmbedder: () => embedder
};