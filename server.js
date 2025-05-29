// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs').promises;
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const cheerio = require('cheerio');
const axios = require('axios');
const robotsParser = require('robots-parser');
const OpenAI = require('openai');

// Alternative implementation using node-fetch
const fetch = require('node-fetch'); // You might need to install this: npm install node-fetch

const app = express();

// Configure multer for file uploads (Multer 2.x syntax)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.txt', '.pdf', '.docx', '.md'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only .txt, .pdf, .docx, and .md files are allowed'));
        }
    }
});

// Add Transformers.js import
let pipeline;
let embedder = null;
(async () => {
    const { pipeline: importedPipeline } = await import('@xenova/transformers');
    pipeline = importedPipeline;
})();

// Add model loading state
let localModel = null;
let modelLoading = false;
let modelError = null;

// RAG Document Store
let documentStore = [];
let documentEmbeddings = [];
let websiteCrawlData = {
    lastCrawl: null,
    crawlInProgress: false,
    crawledPages: 0,
    errors: []
};

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Enhanced logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Get local model information
function getLocalModelInfo(modelName) {
    const modelConfig = {
        'Xenova/distilgpt2': {
            task: 'text-generation',
            size: 'small',
            description: 'Fast, lightweight text generation model',
            memoryUsage: '~250MB'
        },
        'Xenova/gpt2': {
            task: 'text-generation',
            size: 'medium',
            description: 'Standard GPT-2 text generation model',
            memoryUsage: '~700MB'
        },
        'Xenova/distilbert-base-uncased-finetuned-sst-2-english': {
            task: 'sentiment-analysis',
            size: 'small',
            description: 'Sentiment analysis with conversational responses',
            memoryUsage: '~400MB'
        },
        'Xenova/distilbert-base-cased-distilled-squad': {
            task: 'question-answering',
            size: 'medium',
            description: 'Question answering with context',
            memoryUsage: '~400MB'
        },
        'Xenova/flan-t5-small': {
            task: 'text2text-generation',
            size: 'small',
            description: 'Instruction-following text generation',
            memoryUsage: '~450MB'
        },
        'Xenova/LaMini-Flan-T5-248M': {
            task: 'text2text-generation',
            size: 'small',
            description: 'Conversational instruction-following model',
            memoryUsage: '~300MB'
        }
    };
    
    return modelConfig[modelName] || {
        task: 'text-generation',
        size: 'unknown',
        description: 'Unknown model',
        memoryUsage: 'Unknown'
    };
}

// Initialize embedder for RAG
async function initializeEmbedder() {
    if (embedder) return embedder;
    
    try {
        console.log('Initializing text embedder for RAG...');
        embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        console.log('✅ Embedder initialized successfully!');
        return embedder;
    } catch (error) {
        console.error('❌ Failed to initialize embedder:', error);
        return null;
    }
}

// Initialize local model
async function initializeLocalModel(modelName = 'Xenova/LaMini-Flan-T5-248M') {
    if (localModel && !modelLoading) {
        console.log('Local model already initialized');
        return true;
    }
    
    if (modelLoading) {
        console.log('Model already loading...');
        return false;
    }
    
    modelLoading = true;
    modelError = null;
    
    // Define fallback models in order of preference
    const fallbackModels = [
        modelName,
        'Xenova/LaMini-Flan-T5-248M',
        'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
        'Xenova/distilgpt2',
        'Xenova/gpt2'
    ];
    
    for (const fallbackModel of [...new Set(fallbackModels)]) {
        try {
            console.log(`\n🤖 TRYING MODEL: ${fallbackModel}`);
            console.log('Loading pipeline...');
            
            const modelInfo = getLocalModelInfo(fallbackModel);
            console.log(`Task: ${modelInfo.task}`);
            console.log(`Expected memory usage: ${modelInfo.memoryUsage}`);
            
            if (modelInfo.task === 'text-generation') {
                localModel = await pipeline('text-generation', fallbackModel);
            } else if (modelInfo.task === 'sentiment-analysis') {
                localModel = await pipeline('sentiment-analysis', fallbackModel);
            } else if (modelInfo.task === 'question-answering') {
                localModel = await pipeline('question-answering', fallbackModel);
            } else if (modelInfo.task === 'text2text-generation') {
                localModel = await pipeline('text2text-generation', fallbackModel);
            } else {
                throw new Error(`Unsupported task type: ${modelInfo.task}`);
            }
            
            modelLoading = false;
            console.log(`✅ Successfully loaded model: ${fallbackModel}`);
            
            // Update the environment variable to remember successful model
            process.env.LOCAL_MODEL_NAME = fallbackModel;
            
            return true;
            
        } catch (error) {
            console.log(`❌ Failed to load ${fallbackModel}: ${error.message}`);
            
            if (fallbackModel === fallbackModels[fallbackModels.length - 1]) {
                // This was the last fallback option
                modelLoading = false;
                modelError = `All model loading attempts failed. Last error: ${error.message}`;
                console.error('❌ All fallback models failed');
                return false;
            }
            
            // Continue to next fallback model
            console.log('⏭️ Trying next fallback model...');
        }
    }
    
    modelLoading = false;
    modelError = 'No models could be loaded';
    return false;
}

// Website crawling functions
async function crawlWebsite(baseUrl, options = {}) {
    const {
        maxPages = 50,
        respectRobots = true,
        includeExternalLinks = false,
        crawlDelay = 1000,
        userAgent = 'WebAppChatbot/1.0'
    } = options;

    console.log(`\n=== STARTING WEBSITE CRAWL ===`);
    console.log('Base URL:', baseUrl);
    console.log('Max pages:', maxPages);
    console.log('Crawl delay:', crawlDelay + 'ms');

    websiteCrawlData.crawlInProgress = true;
    websiteCrawlData.errors = [];
    websiteCrawlData.crawledPages = 0;

    const visitedUrls = new Set();
    const urlsToVisit = [baseUrl];
    const crawledPages = [];
    let robotsTxt = null;

    // Check robots.txt if requested
    if (respectRobots) {
        try {
            const robotsUrl = new URL('/robots.txt', baseUrl).href;
            const robotsResponse = await axios.get(robotsUrl, { timeout: 5000 });
            robotsTxt = robotsParser(robotsUrl, robotsResponse.data);
            console.log('✅ Loaded robots.txt');
        } catch (error) {
            console.log('ℹ️  No robots.txt found or accessible');
        }
    }

    while (urlsToVisit.length > 0 && crawledPages.length < maxPages) {
        const currentUrl = urlsToVisit.shift();
        
        if (visitedUrls.has(currentUrl)) continue;
        visitedUrls.add(currentUrl);

        // Check robots.txt permissions
        if (robotsTxt && !robotsTxt.isAllowed(currentUrl, userAgent)) {
            console.log(`🚫 Robots.txt disallows: ${currentUrl}`);
            continue;
        }

        try {
            console.log(`🔍 Crawling: ${currentUrl}`);
            
            const response = await axios.get(currentUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': userAgent
                }
            });

            if (response.headers['content-type']?.includes('text/html')) {
                const $ = cheerio.load(response.data);
                
                // Extract page content
                const pageData = extractPageContent($, currentUrl);
                
                if (pageData.content.trim().length > 100) { // Only store pages with substantial content
                    crawledPages.push(pageData);
                    websiteCrawlData.crawledPages++;
                    console.log(`✅ Extracted content from: ${pageData.title || currentUrl}`);
                }

                // Find more URLs to crawl
                if (crawledPages.length < maxPages) {
                    const newUrls = extractLinksFromPage($, currentUrl, baseUrl, includeExternalLinks);
                    newUrls.forEach(url => {
                        if (!visitedUrls.has(url) && !urlsToVisit.includes(url)) {
                            urlsToVisit.push(url);
                        }
                    });
                }
            }

            // Respectful crawling delay
            if (crawlDelay > 0) {
                await new Promise(resolve => setTimeout(resolve, crawlDelay));
            }

        } catch (error) {
            console.error(`❌ Error crawling ${currentUrl}:`, error.message);
            websiteCrawlData.errors.push({
                url: currentUrl,
                error: error.message
            });
        }
    }

    websiteCrawlData.crawlInProgress = false;
    websiteCrawlData.lastCrawl = new Date().toISOString();

    console.log(`=== CRAWL COMPLETE ===`);
    console.log(`Crawled ${crawledPages.length} pages`);
    console.log(`Errors: ${websiteCrawlData.errors.length}`);

    return crawledPages;
}

function extractPageContent($, url) {
    // Remove unwanted elements
    $('script, style, nav, header, footer, .sidebar, .menu, .navigation').remove();
    
    // Extract title
    const title = $('title').text().trim() || 
                  $('h1').first().text().trim() || 
                  'Untitled Page';
    
    // Extract meta description
    const description = $('meta[name="description"]').attr('content') || '';
    
    // Extract main content
    let content = '';
    
    // Try common content containers first
    const contentSelectors = [
        'main',
        '[role="main"]',
        '.content',
        '.main-content',
        '.post-content',
        '.article-content',
        'article',
        '.page-content'
    ];
    
    for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length > 0) {
            content = element.text().trim();
            break;
        }
    }
    
    // Fallback to body content if no specific container found
    if (!content) {
        content = $('body').text().trim();
    }
    
    // Clean up content
    content = content
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .replace(/\n+/g, '\n') // Normalize line breaks
        .trim();
    
    // Extract headings for structure
    const headings = [];
    $('h1, h2, h3, h4, h5, h6').each((i, el) => {
        const text = $(el).text().trim();
        const level = el.tagName.toLowerCase();
        if (text) {
            headings.push({ level, text });
        }
    });
    
    return {
        url,
        title,
        description,
        content,
        headings,
        wordCount: content.split(' ').length,
        extractedAt: new Date().toISOString()
    };
}

function extractLinksFromPage($, currentUrl, baseUrl, includeExternalLinks) {
    const links = [];
    const currentDomain = new URL(baseUrl).hostname;
    
    $('a[href]').each((i, el) => {
        try {
            const href = $(el).attr('href');
            const absoluteUrl = new URL(href, currentUrl).href;
            const urlObj = new URL(absoluteUrl);
            
            // Skip non-HTTP(S) links
            if (!['http:', 'https:'].includes(urlObj.protocol)) return;
            
            // Skip file extensions that aren't web pages
            const skipExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.tar', '.gz', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.mp3', '.mp4', '.avi'];
            if (skipExtensions.some(ext => urlObj.pathname.toLowerCase().endsWith(ext))) return;
            
            // Include external links only if specified
            if (!includeExternalLinks && urlObj.hostname !== currentDomain) return;
            
            // Skip common non-content URLs
            const skipPatterns = ['/wp-admin/', '/admin/', '/login/', '/logout/', '/register/', '/cart/', '/checkout/'];
            if (skipPatterns.some(pattern => urlObj.pathname.includes(pattern))) return;
            
            links.push(absoluteUrl);
        } catch (error) {
            // Invalid URL, skip
        }
    });
    
    return [...new Set(links)]; // Remove duplicates
}

// Chunk text into smaller pieces
function chunkText(text, chunkSize = 500, overlap = 50) {
    const words = text.split(/\s+/);
    const chunks = [];
    
    for (let i = 0; i < words.length; i += chunkSize - overlap) {
        const chunk = words.slice(i, i + chunkSize).join(' ');
        if (chunk.trim()) {
            chunks.push(chunk.trim());
        }
    }
    
    return chunks;
}

// Generate embeddings for text
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

// Calculate cosine similarity
function cosineSimilarity(a, b) {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

// Process website pages into chunks and embeddings
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
                console.error(`Error generating embedding for chunk ${i} of ${page.title}:`, error);
            }
        }
    }
    
    console.log(`✅ Processed ${processedChunks.length} chunks from ${pages.length} pages`);
    return processedChunks;
}

// Main crawl and index function
async function crawlAndIndexWebsite(baseUrl = null, options = {}) {
    // Use provided URL or try to detect from request
    const targetUrl = baseUrl || `http://localhost:${process.env.PORT || 3000}`;
    
    console.log(`Starting crawl and index of: ${targetUrl}`);
    
    try {
        // Crawl the website
        const pages = await crawlWebsite(targetUrl, options);
        
        if (pages.length === 0) {
            console.log('No pages found to index');
            return;
        }
        
        // Process pages into chunks and embeddings
        const websiteChunks = await processWebsitePages(pages);
        
        // Remove old website content
        documentEmbeddings = documentEmbeddings.filter(d => d.type !== 'website');
        documentStore = documentStore.filter(d => d.type !== 'website');
        
        // Add new website content
        documentEmbeddings.push(...websiteChunks);
        
        // Add website info to document store
        const websiteDoc = {
            filename: `Website: ${targetUrl}`,
            type: 'website',
            uploadedAt: new Date().toISOString(),
            chunks: websiteChunks.length,
            pages: pages.length,
            totalLength: pages.reduce((sum, page) => sum + page.content.length, 0),
            baseUrl: targetUrl
        };
        
        documentStore.push(websiteDoc);
        
        console.log(`✅ Website indexing complete: ${pages.length} pages, ${websiteChunks.length} chunks`);
        
    } catch (error) {
        console.error('Error during website crawl and index:', error);
        websiteCrawlData.crawlInProgress = false;
        throw error;
    }
}

// Retrieve relevant documents
async function retrieveRelevantChunks(query, topK = 3) {
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

// Generate response using local model with RAG
async function generateLocalResponseWithRAG(message, modelName = 'distilgpt2', useRAG = true, includeWebsiteContent = true) {
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

async function generateResponseWithContext(message, context, sources, modelName) {
    if (!localModel) {
        throw new Error('Local model not initialized');
    }
    
    const modelInfo = getLocalModelInfo(modelName);
    
    try {
        if (modelInfo.task === 'text-generation') {
            let prompt = message;
            
            if (context) {
                prompt = `Context from documentation and website:
${context}

Question: ${message}

Based on the context above, please provide a helpful and accurate answer:`;
            }
            
            const result = await localModel(prompt, {
                max_new_tokens: 200,
                temperature: 0.7,
                do_sample: true,
                return_full_text: false
            });
            
            let response = result[0].generated_text.trim();
            
            if (sources.length > 0) {
                response += `\n\n📚 **Sources:**\n${sources.map(s => `• ${s}`).join('\n')}`;
            }
            
            return response;
            
        } else if (modelInfo.task === 'text2text-generation') {
            let prompt = `Answer the following question based on the provided context.

Context: ${context || 'No specific context provided.'}

Question: ${message}

Answer:`;
            
            const result = await localModel(prompt, {
                max_new_tokens: 200
            });
            
            let response = result[0].generated_text.trim();
            
            if (sources.length > 0) {
                response += `\n\n📚 **Sources:**\n${sources.map(s => `• ${s}`).join('\n')}`;
            }
            
            return response;
        }
        
        // Fallback for other model types
        const result = await localModel(message, {
            max_new_tokens: 150,
            temperature: 0.7
        });
        
        let response = result[0]?.generated_text || result.answer || "I couldn't generate a response.";
        
        if (sources.length > 0) {
            response += `\n\n📚 **Sources:**\n${sources.map(s => `• ${s}`).join('\n')}`;
        }
        
        return response;
        
    } catch (error) {
        console.error('Error generating response with context:', error);
        throw error;
    }
}

// Initialize Azure OpenAI client
let azureOpenAIClient = null;

// Initialize Azure OpenAI client
function initializeAzureOpenAI() {
    if (azureOpenAIClient) return azureOpenAIClient;
    
    try {
        const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
        const apiKey = process.env.AZURE_OPENAI_KEY;
        const apiVersion = process.env.AZURE_OPENAI_VERSION;
        
        console.log('Initializing Azure OpenAI with:');
        console.log('Endpoint:', endpoint ? endpoint.substring(0, 30) + '...' : 'NOT SET');
        console.log('API Key:', apiKey ? 'SET (length: ' + apiKey.length + ')' : 'NOT SET');
        console.log('Deployment:', process.env.AZURE_OPENAI_DEPLOYMENT);
        console.log('Version:', apiVersion);
        
        if (!endpoint || !apiKey) {
            console.log('⚠️ Azure OpenAI credentials not configured');
            console.log('Missing:', !endpoint ? 'endpoint' : '', !apiKey ? 'apiKey' : '');
            return null;
        }
        
        // Create Azure OpenAI client using the updated OpenAI library
        azureOpenAIClient = new OpenAI({
            apiKey: apiKey,
            baseURL: `${endpoint}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`,
            defaultQuery: { 'api-version': apiVersion },
            defaultHeaders: {
                'api-key': apiKey,
            },
        });
        
        console.log('✅ Azure OpenAI client initialized');
        return azureOpenAIClient;
        
    } catch (error) {
        console.error('❌ Failed to initialize Azure OpenAI client:', error);
        return null;
    }
}

// Generate response using Azure OpenAI with RAG
async function generateAzureOpenAIResponseWithRAG(message, useRAG = true, includeWebsiteContent = true) {
    if (!azureOpenAIClient) {
        azureOpenAIClient = initializeAzureOpenAI();
        if (!azureOpenAIClient) {
            throw new Error('Azure OpenAI client not available');
        }
    }
    
    let context = '';
    let sources = [];
    
    // Retrieve relevant documents if RAG is enabled
    if (useRAG && documentEmbeddings.length > 0) {
        console.log('Retrieving relevant documents for Azure OpenAI RAG...');
        
        // Filter embeddings based on preferences
        let availableEmbeddings = documentEmbeddings;
        if (!includeWebsiteContent) {
            availableEmbeddings = documentEmbeddings.filter(d => d.type !== 'website');
        }
        
        if (availableEmbeddings.length > 0) {
            // Initialize embedder for RAG if needed
            if (!embedder) {
                await initializeEmbedder();
            }
            
            if (embedder) {
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
                    .slice(0, parseInt(process.env.RAG_TOP_K) || 3);
                
                if (relevantChunks.length > 0) {
                    context = relevantChunks.map(chunk => chunk.chunk).join('\n\n');
                    sources = [...new Set(relevantChunks.map(chunk => chunk.source))];
                    
                    console.log(`Found ${relevantChunks.length} relevant chunks from: ${sources.join(', ')}`);
                    console.log('Content types:', [...new Set(relevantChunks.map(c => c.type))]);
                }
            }
        }
    }
    
    // Generate response with Azure OpenAI
    return await generateAzureOpenAIResponse(message, context, sources);
}

// Generate response using Azure OpenAI
async function generateAzureOpenAIResponse(message, context = '', sources = []) {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_KEY;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
    const apiVersion = process.env.AZURE_OPENAI_VERSION;
    
    console.log('Checking Azure OpenAI configuration...');
    console.log('Endpoint:', endpoint ? 'SET' : 'NOT SET');
    console.log('API Key:', apiKey ? 'SET' : 'NOT SET');
    console.log('Deployment:', deployment || 'NOT SET');
    console.log('API Version:', apiVersion || 'NOT SET');
    
    if (!endpoint || !apiKey || !deployment) {
        throw new Error('Azure OpenAI configuration incomplete. Missing: ' + 
            [!endpoint && 'endpoint', !apiKey && 'apiKey', !deployment && 'deployment']
            .filter(Boolean).join(', '));
    }
    
    // Initialize Azure OpenAI client if not already done
    if (!azureOpenAIClient) {
        azureOpenAIClient = initializeAzureOpenAI();
        if (!azureOpenAIClient) {
            throw new Error('Failed to initialize Azure OpenAI client');
        }
    }
    
    try {
        let systemMessage = "You are a helpful AI assistant. Provide accurate, helpful, and informative responses.";
        let userMessage = message;
        
        // Add context if available
        if (context) {
            systemMessage += " Use the provided context to answer questions when relevant, but you can also use your general knowledge when appropriate.";
            userMessage = `Context from documentation and website:
${context}

Question: ${message}

Please provide a helpful and accurate answer based on the context above and your knowledge:`;
        }
        
        // Determine if this is an o1 model
        const isO1Model = deployment.toLowerCase().includes('o1');
        
        console.log(`Calling Azure OpenAI deployment: ${deployment}`);
        console.log(`Model type: ${isO1Model ? 'o1-series' : 'standard'}`);
        
        let response;
        
        if (isO1Model) {
            // o1 models have specific requirements:
            // - No system messages (they're built into the model)
            // - Use max_completion_tokens instead of max_tokens
            // - Temperature and top_p are not supported
            // - Only user messages are supported
            
            console.log('Using o1-specific parameters');
            
            response = await azureOpenAIClient.chat.completions.create({
                messages: [{ role: "user", content: userMessage }],
                max_completion_tokens: 2000  // o1 models use max_completion_tokens
                // Note: o1 models don't support temperature, top_p, frequency_penalty, presence_penalty
            });
            
        } else {
            // Standard GPT models (gpt-3.5, gpt-4, etc.)
            let maxTokens = 1000;
            let temperature = 0.7;
            
            // Adjust parameters for different standard models
            if (deployment.includes('gpt-4')) {
                maxTokens = 1500;
                temperature = 0.7;
            } else if (deployment.includes('gpt-3.5')) {
                maxTokens = 1000;
                temperature = 0.7;
            }
            
            console.log(`Using standard parameters - Max tokens: ${maxTokens}, Temperature: ${temperature}`);
            
            const messages = [
                { role: "system", content: systemMessage },
                { role: "user", content: userMessage }
            ];
            
            response = await azureOpenAIClient.chat.completions.create({
                messages: messages,
                max_tokens: maxTokens,  // Standard models use max_tokens
                temperature: temperature,
                top_p: 0.9,
                frequency_penalty: 0,
                presence_penalty: 0
            });
        }
        
        console.log('Azure OpenAI response received');
        
        let aiResponse = response.choices[0]?.message?.content || "I couldn't generate a response.";
        
        // Add sources if available
        if (sources.length > 0) {
            aiResponse += `\n\n📚 **Sources:**\n${sources.map(s => `• ${s}`).join('\n')}`;
        }
        
        console.log(`✅ Azure OpenAI response generated (${aiResponse.length} characters)`);
        return aiResponse;
        
    } catch (error) {
        console.error('❌ Azure OpenAI API error:', error);
        
        // Provide more specific error messages
        if (error.status === 404) {
            throw new Error(`Azure OpenAI deployment '${deployment}' not found. Please check your deployment name.`);
        } else if (error.status === 401) {
            throw new Error('Invalid Azure OpenAI API key. Please check your credentials.');
        } else if (error.status === 429) {
            throw new Error('Azure OpenAI quota exceeded. Please check your usage limits.');
        } else if (error.status === 400) {
            throw new Error(`Azure OpenAI parameter error: ${error.message}`);
        } else {
            throw new Error(`Azure OpenAI error: ${error.message}`);
        }
    }
}

// Chat API endpoint with RAG support
app.post('/api/chat', async (req, res) => {
    const startTime = Date.now();
    console.log('\n=== CHAT API REQUEST START ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    try {
        const { message, useRAG = true, includeWebsiteContent = true } = req.body;
        
        if (!message) {
            console.log('ERROR: Missing message in request body');
            return res.status(400).json({ 
                error: 'Message is required',
                details: 'No message provided in request body'
            });
        }

        // Check if we should use local model
        const useLocalModel = process.env.USE_LOCAL_MODEL === 'true';
        const localModelName = process.env.LOCAL_MODEL_NAME || 'distilgpt2';
        
        console.log('Model Configuration:');
        console.log('- Use Local Model:', useLocalModel);
        console.log('- Local Model Name:', localModelName);
        console.log('- Use RAG:', useRAG);
        console.log('- Include Website Content:', includeWebsiteContent);
        console.log('- Documents Available:', documentStore.length);
        console.log('- Website Pages:', documentEmbeddings.filter(d => d.type === 'website').length);

        if (useLocalModel) {
            // Initialize model if not already loaded
            if (!localModel && !modelLoading && !modelError) {
                console.log('Initializing local model...');
                const initialized = await initializeLocalModel(localModelName);
                if (!initialized) {
                    return res.status(500).json({
                        error: 'Failed to initialize local model',
                        details: modelError || 'Model initialization failed',
                        troubleshooting: 'Check server logs and ensure the model name is valid'
                    });
                }
            }
            
            // Auto-crawl website if no website content and includeWebsiteContent is true
            if (includeWebsiteContent && useRAG) {
                const websiteChunks = documentEmbeddings.filter(d => d.type === 'website');
                if (websiteChunks.length === 0 && !websiteCrawlData.crawlInProgress) {
                    console.log('No website content found, triggering auto-crawl...');
                    // Don't wait for crawl to complete, just trigger it
                    crawlAndIndexWebsite().catch(error => {
                        console.error('Auto-crawl failed:', error);
                    });
                }
            }
            
            // Initialize embedder for RAG if needed
            if (useRAG && !embedder) {
                await initializeEmbedder();
            }
            
            // Wait for model to finish loading if it's currently loading
            if (modelLoading) {
                console.log('Model is still loading...');
                return res.status(202).json({
                    error: 'Model is loading',
                    details: 'The local model is currently being initialized. Please try again in a moment.',
                    status: 'loading',
                    estimatedWaitTime: '30-60 seconds'
                });
            }
            
            // Check if model failed to load
            if (modelError) {
                return res.status(500).json({
                    error: 'Local model failed to load',
                    details: modelError,
                    troubleshooting: 'Check server logs and ensure sufficient memory is available'
                });
            }
            
            // Generate response using local model with RAG
            if (localModel) {
                console.log('Generating response with local model and RAG...');
                
                try {
                    const aiResponse = await generateLocalResponseWithRAG(
                        message, 
                        localModelName, 
                        useRAG,
                        includeWebsiteContent
                    );
                    const duration = Date.now() - startTime;
                    
                    console.log('SUCCESS: Local model response generated');
                    console.log('Response length:', aiResponse.length);
                    console.log('Duration:', duration + 'ms');
                    console.log('=== CHAT API REQUEST END ===\n');
                    
                    return res.json({
                        response: aiResponse,
                        metadata: {
                            duration: duration,
                            model: localModelName,
                            modelType: 'local-transformers',
                            timestamp: new Date().toISOString(),
                            source: 'server-side-local',
                            ragEnabled: useRAG,
                            websiteContentIncluded: includeWebsiteContent,
                            documentsCount: documentStore.length,
                            websitePagesCount: documentEmbeddings.filter(d => d.type === 'website').length,
                            modelInfo: getLocalModelInfo(localModelName)
                        }
                    });
                    
                } catch (error) {
                    console.error('Error with local model RAG:', error);
                    return res.status(500).json({
                        error: 'Local model inference failed',
                        details: error.message,
                        troubleshooting: 'The local model encountered an error during inference'
                    });
                }
            }
        }

        // Use Azure OpenAI when local models are disabled
        console.log('Using Azure OpenAI...');
        
        // Check Azure OpenAI configuration
        const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
        const apiKey = process.env.AZURE_OPENAI_KEY;
        const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
        
        if (!endpoint || !apiKey || !deployment) {
            return res.status(500).json({
                error: 'Azure OpenAI not configured',
                details: `Missing configuration: ${[
                    !endpoint && 'AZURE_OPENAI_ENDPOINT',
                    !apiKey && 'AZURE_OPENAI_KEY', 
                    !deployment && 'AZURE_OPENAI_DEPLOYMENT'
                ].filter(Boolean).join(', ')}`,
                troubleshooting: 'Please check your environment variables in the .env file'
            });
        }
        
        // Auto-crawl website if no website content and includeWebsiteContent is true
        if (includeWebsiteContent && useRAG) {
            const websiteChunks = documentEmbeddings.filter(d => d.type === 'website');
            if (websiteChunks.length === 0 && !websiteCrawlData.crawlInProgress) {
                console.log('No website content found, triggering auto-crawl...');
                crawlAndIndexWebsite().catch(error => {
                    console.error('Auto-crawl failed:', error);
                });
            }
        }
        
        // Initialize embedder for RAG if needed
        if (useRAG && !embedder) {
            await initializeEmbedder();
        }
        
        try {
            console.log('Generating response with Azure OpenAI and RAG...');
            
            const aiResponse = await generateAzureOpenAIResponseWithRAG(
                message, 
                useRAG,
                includeWebsiteContent
            );
            const duration = Date.now() - startTime;
            
            console.log('SUCCESS: Azure OpenAI response generated');
            console.log('Response length:', aiResponse.length);
            console.log('Duration:', duration + 'ms');
            console.log('=== CHAT API REQUEST END ===\n');
            
            return res.json({
                response: aiResponse,
                metadata: {
                    duration: duration,
                    model: deployment,
                    modelType: 'azure-openai',
                    timestamp: new Date().toISOString(),
                    source: 'azure-cloud',
                    ragEnabled: useRAG,
                    websiteContentIncluded: includeWebsiteContent,
                    documentsCount: documentStore.length,
                    websitePagesCount: documentEmbeddings.filter(d => d.type === 'website').length,
                    endpoint: endpoint?.split('.')[0] + '...' // Partially masked endpoint
                }
            });
            
        } catch (error) {
            console.error('Error with Azure OpenAI:', error);
            return res.status(500).json({
                error: 'Azure OpenAI request failed',
                details: error.message,
                troubleshooting: 'Check your Azure OpenAI configuration and quota'
            });
        }
    } catch (error) {
        const duration = Date.now() - startTime;
        console.log('\n!!! CHAT API EXCEPTION !!!');
        console.log('Error type:', error.constructor.name);
        console.log('Error message:', error.message);
        console.log('Error stack:', error.stack);
        console.log('Duration before error:', duration + 'ms');
        console.log('=== CHAT API REQUEST END (WITH ERROR) ===\n');
        
        res.status(500).json({ 
            error: 'Internal server error',
            details: {
                type: error.constructor.name,
                message: error.message,
                timestamp: new Date().toISOString()
            },
            troubleshooting: 'Check server logs for detailed error information'
        });
    }
});

// Website crawling endpoints
app.post('/api/website/crawl', async (req, res) => {
    console.log('\n=== WEBSITE CRAWL REQUEST ===');
    
    try {
        const { 
            baseUrl, 
            maxPages = 20, 
            respectRobots = true, 
            includeExternalLinks = false,
            crawlDelay = 1000 
        } = req.body;
        
        if (!baseUrl) {
            return res.status(400).json({
                error: 'Base URL is required',
                details: 'Please provide a baseUrl to crawl'
            });
        }
        
        if (websiteCrawlData.crawlInProgress) {
            return res.status(409).json({
                error: 'Crawl already in progress',
                details: 'Please wait for the current crawl to complete'
            });
        }
        
        // Validate URL
        try {
            new URL(baseUrl);
        } catch (error) {
            return res.status(400).json({
                error: 'Invalid URL',
                details: 'Please provide a valid HTTP(S) URL'
            });
        }
        
        // Start crawling (don't await - return immediately)
        crawlAndIndexWebsite(baseUrl, {
            maxPages,
            respectRobots,
            includeExternalLinks,
            crawlDelay
        }).catch(error => {
            console.error('Website crawl failed:', error);
            websiteCrawlData.crawlInProgress = false;
        });
        
        res.json({
            success: true,
            message: 'Website crawl started',
            baseUrl: baseUrl,
            options: { maxPages, respectRobots, includeExternalLinks, crawlDelay },
            status: 'in-progress'
        });
        
    } catch (error) {
        console.error('Website crawl request error:', error);
        res.status(500).json({
            error: 'Failed to start website crawl',
            details: error.message
        });
    }
});

// Auto-crawl current website (existing POST endpoint)
app.post('/api/website/auto-crawl', async (req, res) => {
    try {
        const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
        
        // Start auto-crawl
        crawlAndIndexWebsite(baseUrl, {
            maxPages: 20,
            respectRobots: false, // Skip robots.txt for own site
            includeExternalLinks: false,
            crawlDelay: 500 // Faster for local crawling
        }).catch(error => {
            console.error('Auto-crawl failed:', error);
        });
        
        res.json({
            success: true,
            message: 'Auto-crawl started for current website',
            baseUrl: baseUrl
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Failed to start auto-crawl',
            details: error.message
        });
    }
});

// Add GET endpoint for browser access
app.get('/api/website/auto-crawl', async (req, res) => {
    try {
        const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
        
        // Check if crawl is already in progress
        if (websiteCrawlData.crawlInProgress) {
            return res.json({
                success: false,
                message: 'Auto-crawl already in progress',
                status: 'in-progress',
                baseUrl: baseUrl,
                crawledPages: websiteCrawlData.crawledPages
            });
        }
        
        // Start auto-crawl
        crawlAndIndexWebsite(baseUrl, {
            maxPages: 20,
            respectRobots: false, // Skip robots.txt for own site
            includeExternalLinks: false,
            crawlDelay: 500 // Faster for local crawling
        }).catch(error => {
            console.error('Auto-crawl failed:', error);
        });
        
        res.json({
            success: true,
            message: 'Auto-crawl started for current website',
            baseUrl: baseUrl,
            tip: 'Check status at /api/website/status'
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Failed to start auto-crawl',
            details: error.message
        });
    }
});

// Get website crawl status
app.get('/api/website/status', (req, res) => {
    res.json({
        crawl: websiteCrawlData,
        websiteContent: {
            pages: documentEmbeddings.filter(d => d.type === 'website').length > 0 ? 
                   [...new Set(documentEmbeddings.filter(d => d.type === 'website').map(d => d.url))].length : 0,
            chunks: documentEmbeddings.filter(d => d.type === 'website').length
        },
        timestamp: new Date().toISOString()
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    const config = {
        useLocalModel: process.env.USE_LOCAL_MODEL === 'true',
        localModelName: process.env.LOCAL_MODEL_NAME || 'distilgpt2',
        azureOpenAIConfigured: !!(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_KEY),
        azureOpenAIDeployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'not set',
        nodeVersion: process.version,
        platform: process.platform
    };
    
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        config,
        models: {
            localModel: !!localModel,
            modelLoading,
            modelError,
            embedder: !!embedder,
            azureOpenAI: !!azureOpenAIClient
        },
        rag: {
            documents: documentStore.length,
            chunks: documentEmbeddings.length,
            websitePages: documentEmbeddings.filter(d => d.type === 'website').length
        }
    });
});

// Debug environment endpoint
app.get('/api/debug/env', (req, res) => {
    const debugInfo = {
        USE_LOCAL_MODEL: process.env.USE_LOCAL_MODEL || 'not set',
        LOCAL_MODEL_NAME: process.env.LOCAL_MODEL_NAME || 'not set',
        NODE_ENV: process.env.NODE_ENV || 'not set',
        PORT: process.env.PORT || 'not set',
        NODE_VERSION: process.version,
        PLATFORM: process.platform,
        MEMORY_USAGE: process.memoryUsage()
    };
    
    res.json(debugInfo);
});

// Add this debug endpoint to check Azure OpenAI configuration
app.get('/api/debug/azure-config', (req, res) => {
    res.json({
        endpoint: process.env.AZURE_OPENAI_ENDPOINT ? 'SET' : 'NOT SET',
        endpointValue: process.env.AZURE_OPENAI_ENDPOINT ? process.env.AZURE_OPENAI_ENDPOINT.substring(0, 30) + '...' : 'undefined',
        key: process.env.AZURE_OPENAI_KEY ? 'SET (length: ' + process.env.AZURE_OPENAI_KEY.length + ')' : 'NOT SET',
        deployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'NOT SET',
        version: process.env.AZURE_OPENAI_VERSION || 'NOT SET',
        useLocalModel: process.env.USE_LOCAL_MODEL,
        allEnvKeys: Object.keys(process.env).filter(key => key.includes('AZURE')).sort(),
        configStatus: {
            hasEndpoint: !!process.env.AZURE_OPENAI_ENDPOINT,
            hasKey: !!process.env.AZURE_OPENAI_KEY,
            hasDeployment: !!process.env.AZURE_OPENAI_DEPLOYMENT,
            hasVersion: !!process.env.AZURE_OPENAI_VERSION,
            allConfigured: !!(process.env.AZURE_OPENAI_ENDPOINT && 
                             process.env.AZURE_OPENAI_KEY && 
                             process.env.AZURE_OPENAI_DEPLOYMENT && 
                             process.env.AZURE_OPENAI_VERSION)
        },
        timestamp: new Date().toISOString()
    });
});

// Model management endpoints
app.post('/api/model/initialize', async (req, res) => {
    try {
        const { modelName } = req.body;
        const targetModel = modelName || process.env.LOCAL_MODEL_NAME || 'distilgpt2';
        
        console.log(`Manual model initialization requested: ${targetModel}`);
        
        const success = await initializeLocalModel(targetModel);
        
        if (success) {
            res.json({
                success: true,
                message: `Model ${targetModel} initialized successfully`,
                model: targetModel,
                info: getLocalModelInfo(targetModel)
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Model initialization failed',
                details: modelError
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Model initialization error',
            details: error.message
        });
    }
});

app.get('/api/model/status', (req, res) => {
    const modelName = process.env.LOCAL_MODEL_NAME || 'distilgpt2';
    
    res.json({
        model: {
            name: modelName,
            loaded: !!localModel,
            loading: modelLoading,
            error: modelError,
            info: getLocalModelInfo(modelName)
        },
        embedder: {
            loaded: !!embedder,
            status: embedder ? 'ready' : 'not initialized'
        },
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});

// Test model download endpoint
app.post('/api/model/test-download', async (req, res) => {
    const { modelName } = req.body;
    const testModel = modelName || 'Xenova/LaMini-Flan-T5-248M';
    
    try {
        console.log(`Testing download for model: ${testModel}`);
        
        // Try to load just the tokenizer first (faster test)
        const { AutoTokenizer } = await import('@xenova/transformers');
        const tokenizer = await AutoTokenizer.from_pretrained(testModel);
        
        res.json({
            success: true,
            message: `Model ${testModel} is accessible`,
            modelName: testModel,
            tokenizerReady: !!tokenizer
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Model download test failed',
            modelName: testModel,
            details: error.message
        });
    }
});

// Test Azure OpenAI connection
app.post('/api/azure-openai/test', async (req, res) => {
    try {
        console.log('Testing Azure OpenAI connection...');
        
        const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
        const apiKey = process.env.AZURE_OPENAI_KEY;
        const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
        
        if (!endpoint || !apiKey || !deployment) {
            return res.status(500).json({
                success: false,
                error: 'Azure OpenAI not configured',
                details: 'Missing credentials or configuration',
                missing: [
                    !endpoint && 'AZURE_OPENAI_ENDPOINT',
                    !apiKey && 'AZURE_OPENAI_KEY',
                    !deployment && 'AZURE_OPENAI_DEPLOYMENT'
                ].filter(Boolean)
            });
        }
        
        // Initialize client if needed
        if (!azureOpenAIClient) {
            azureOpenAIClient = initializeAzureOpenAI();
            if (!azureOpenAIClient) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to initialize Azure OpenAI client',
                    details: 'Client initialization failed'
                });
            }
        }
        
        const testMessage = req.body.message || "Hello, this is a test message. Please respond briefly.";
        const isO1Model = deployment.toLowerCase().includes('o1');
        
        console.log(`Testing ${isO1Model ? 'o1-series' : 'standard'} model: ${deployment}`);
        
        let result;
        
        if (isO1Model) {
            // o1 models use different parameters
            result = await azureOpenAIClient.chat.completions.create({
                messages: [{ role: "user", content: testMessage }],
                max_completion_tokens: 100  // o1 models use max_completion_tokens
            });
        } else {
            // Standard models
            result = await azureOpenAIClient.chat.completions.create({
                messages: [{ role: "user", content: testMessage }],
                max_tokens: 50,  // Standard models use max_tokens
                temperature: 0.7
            });
        }
        
        const response = result.choices[0]?.message?.content || "No response";
        
        res.json({
            success: true,
            message: 'Azure OpenAI connection successful',
            deployment: deployment,
            modelType: isO1Model ? 'o1-series' : 'standard',
            testResponse: response,
            timestamp: new Date().toISOString(),
            usage: result.usage || null
        });
        
    } catch (error) {
        console.error('Azure OpenAI test failed:', error);
        res.status(500).json({
            success: false,
            error: 'Azure OpenAI test failed',
            details: error.message,
            deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
            statusCode: error.status || 'unknown',
            errorCode: error.code || 'unknown'
        });
    }
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log('\n🚀 SERVER STARTING 🚀');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Server running on port: ${port}`);
    console.log(`Health check: http://localhost:${port}/api/health`);
    console.log(`Environment debug: http://localhost:${port}/api/debug/env`);
    console.log(`Model status: http://localhost:${port}/api/model/status`);
    console.log(`Website crawl: http://localhost:${port}/api/website/status`);
    console.log(`Node version: ${process.version}`);
    console.log(`Platform: ${process.platform}`);
    console.log('========================\n');
});