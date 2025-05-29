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

// Conditional import of Transformers.js - only for local development
let pipeline = null;
let embedder = null;
let transformersAvailable = false;

// Only attempt to load transformers if NOT in Azure App Service
async function conditionallyLoadTransformers() {
    // Skip transformers entirely in Azure App Service
    if (process.env.WEBSITE_SITE_NAME) {
        console.log('🌐 Azure App Service detected - skipping Transformers.js import');
        return false;
    }
    
    // For local development, always load transformers for embeddings (needed for RAG)
    // Even when using Azure OpenAI, we still need local embeddings for document processing
    try {
        console.log('📦 Attempting to load Transformers.js...');
        const transformers = await import('@xenova/transformers');
        pipeline = transformers.pipeline;
        transformersAvailable = true;
        console.log('✅ Transformers.js loaded successfully');
        return true;
    } catch (error) {
        console.log('⚠️ Transformers.js not available:', error.message);
        return false;
    }
}

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
    // Skip embedder in Azure App Service - use Azure OpenAI for everything
    if (process.env.WEBSITE_SITE_NAME) {
        console.log('📍 Azure App Service detected - embedder not needed (using Azure OpenAI only)');
        return null;
    }
    
    if (embedder) return embedder;
    
    // Ensure transformers is loaded first
    if (!transformersAvailable) {
        const loaded = await conditionallyLoadTransformers();
        if (!loaded) {
            console.log('⚠️ Transformers not available - embedder cannot be initialized');
            return null;
        }
    }
    
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
    // Skip local models entirely in Azure App Service
    if (process.env.WEBSITE_SITE_NAME) {
        console.log('📍 Azure App Service detected - local models not supported');
        modelError = 'Local models not available in Azure App Service';
        return false;
    }
    
    if (localModel && !modelLoading) {
        console.log('Local model already initialized');
        return true;
    }
    
    if (modelLoading) {
        console.log('Model already loading...');
        return false;
    }
    
    // Ensure transformers is loaded first
    if (!transformersAvailable) {
        const loaded = await conditionallyLoadTransformers();
        if (!loaded) {
            modelError = 'Transformers.js not available';
            return false;
        }
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
    let targetUrl = baseUrl;
    
    if (!targetUrl) {
        targetUrl = detectBaseUrl();
    }
    
    console.log(`\n=== CRAWL AND INDEX WEBSITE ===`);
    console.log('Detected URL:', targetUrl);
    console.log('Environment:', process.env.WEBSITE_SITE_NAME ? 'Azure App Service' : 'Local');
    
    try {
        // Validate URL format
        const urlObj = new URL(targetUrl);
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
            throw new Error('Invalid URL protocol. Must be HTTP or HTTPS.');
        }
        
        // Crawl the website
        const pages = await crawlWebsite(targetUrl, options);
        
        if (pages.length === 0) {
            console.log('No pages found to index');
            return [];
        }
        
        // For Azure App Service OR when embedder is not available, store pages without embeddings
        if (process.env.WEBSITE_SITE_NAME || !embedder) {
            console.log('🌐 Storing pages without embeddings (Azure App Service mode or embedder unavailable)');
            
            // Remove old website content
            documentEmbeddings = documentEmbeddings.filter(d => d.type !== 'website');
            documentStore = documentStore.filter(d => d.type !== 'website');
            
            // Create simple chunks without embeddings
            const websiteChunks = [];
            
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
                
                // Store chunks without embeddings for simple text search
                for (let i = 0; i < chunks.length; i++) {
                    const chunk = chunks[i];
                    websiteChunks.push({
                        chunk,
                        embedding: null, // No embedding when embedder unavailable
                        source: `${page.title} (${page.url})`,
                        url: page.url,
                        title: page.title,
                        chunkIndex: i,
                        pageIndex: pages.indexOf(page),
                        type: 'website'
                    });
                }
            }
            
            // Add chunks to storage
            documentEmbeddings.push(...websiteChunks);
            
            // Add website info to document store
            const websiteDoc = {
                filename: `Website: ${targetUrl}`,
                type: 'website',
                uploadedAt: new Date().toISOString(),
                chunks: websiteChunks.length,
                pages: pages.length,
                totalLength: pages.reduce((sum, page) => sum + page.content.length, 0),
                baseUrl: targetUrl,
                note: embedder ? 'With embeddings' : 'No embeddings - text search only'
            };
            
            documentStore.push(websiteDoc);
            
            console.log(`✅ Website indexing complete (${embedder ? 'with' : 'without'} embeddings): ${pages.length} pages, ${websiteChunks.length} chunks`);
            return pages;
            
        } else {
            // Local development with embeddings available
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
            return pages;
        }
        
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
        const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
        const apiVersion = process.env.AZURE_OPENAI_VERSION;
        
        console.log('=== Azure OpenAI Initialization Debug ===');
        console.log('Environment:', process.env.NODE_ENV || 'not set');
        console.log('Azure App Service:', process.env.WEBSITE_SITE_NAME ? 'YES' : 'NO');
        console.log('Endpoint:', endpoint ? endpoint.substring(0, 30) + '...' : 'NOT SET');
        console.log('API Key:', apiKey ? 'SET (length: ' + apiKey.length + ')' : 'NOT SET');
        console.log('Deployment:', deployment || 'NOT SET');
        console.log('Version:', apiVersion || 'NOT SET');
        console.log('===========================================');
        
        if (!endpoint || !apiKey || !deployment) {
            const missing = [];
            if (!endpoint) missing.push('AZURE_OPENAI_ENDPOINT');
            if (!apiKey) missing.push('AZURE_OPENAI_KEY');
            if (!deployment) missing.push('AZURE_OPENAI_DEPLOYMENT');
            
            console.log('⚠️ Azure OpenAI configuration incomplete. Missing:', missing.join(', '));
            return null;
        }
        
        // Validate endpoint format
        if (!endpoint.startsWith('https://')) {
            console.error('❌ Invalid endpoint format. Must start with https://');
            return null;
        }
        
        // Create Azure OpenAI client using the OpenAI library
        azureOpenAIClient = new OpenAI({
            apiKey: apiKey,
            baseURL: `${endpoint}/openai/deployments/${deployment}`,
            defaultQuery: { 'api-version': apiVersion || '2024-08-01-preview' },
            defaultHeaders: {
                'api-key': apiKey,
            },
        });
        
        console.log('✅ Azure OpenAI client initialized successfully');
        return azureOpenAIClient;
        
    } catch (error) {
        console.error('❌ Failed to initialize Azure OpenAI client:', error);
        console.error('Error details:', error.message);
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
    
    // In Azure App Service, skip RAG entirely if no embedder is available
    if (useRAG && documentEmbeddings.length > 0) {
        console.log('RAG requested but in Azure App Service mode - using document text directly');
        
        // For Azure App Service, use simple text matching instead of embeddings
        // This is a fallback when embedder is not available
        if (process.env.WEBSITE_SITE_NAME) {
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
                        .slice(0, parseInt(process.env.RAG_TOP_K) || 3);
                    
                    if (relevantChunks.length > 0) {
                        context = relevantChunks.map(chunk => chunk.chunk).join('\n\n');
                        sources = [...new Set(relevantChunks.map(chunk => chunk.source))];
                        
                        console.log(`Found ${relevantChunks.length} relevant chunks from: ${sources.join(', ')}`);
                    }
                } catch (error) {
                    console.error('❌ RAG error:', error);
                    console.log('📝 Continuing without RAG context...');
                }
            }
        }
    }
    
    // Generate response with Azure OpenAI (with or without context)
    return await generateAzureOpenAIResponse(message, context, sources);
}

// Generate response using Azure OpenAI
async function generateAzureOpenAIResponse(message, context = '', sources = []) {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_KEY;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
    const apiVersion = process.env.AZURE_OPENAI_VERSION;
    
    console.log('=== Azure OpenAI Request Debug ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Environment vars check:');
    console.log('- Endpoint:', endpoint ? 'SET' : 'NOT SET');
    console.log('- API Key:', apiKey ? 'SET' : 'NOT SET');
    console.log('- Deployment:', deployment || 'NOT SET');
    console.log('- Version:', apiVersion || 'NOT SET');
    
    if (!endpoint || !apiKey || !deployment) {
        const error = new Error('Azure OpenAI configuration incomplete. Missing: ' + 
            [!endpoint && 'endpoint', !apiKey && 'apiKey', !deployment && 'deployment']
            .filter(Boolean).join(', '));
        console.error('❌ Configuration error:', error.message);
        throw error;
    }
    
    // Initialize Azure OpenAI client if not already done
    if (!azureOpenAIClient) {
        console.log('Initializing Azure OpenAI client...');
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
        console.log(`Message length: ${userMessage.length} characters`);
        
        let response;
        let requestBody;
        
        if (isO1Model) {
            // o1 models have specific requirements
            requestBody = {
                messages: [{ role: "user", content: userMessage }],
                max_completion_tokens: 2000
            };
            
            console.log('Using o1-specific parameters');
            console.log('Request body:', JSON.stringify(requestBody, null, 2));
            
            response = await azureOpenAIClient.chat.completions.create(requestBody);
            
        } else {
            // Standard GPT models
            let maxTokens = 1000;
            let temperature = 0.7;
            
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
            
            requestBody = {
                messages: messages,
                max_tokens: maxTokens,
                temperature: temperature,
                top_p: 0.9,
                frequency_penalty: 0,
                presence_penalty: 0
            };
            
            console.log('Request body:', JSON.stringify(requestBody, null, 2));
            
            response = await azureOpenAIClient.chat.completions.create(requestBody);
        }
        
        console.log('Azure OpenAI response received successfully');
        console.log('Response type:', typeof response);
        console.log('Response structure:', Object.keys(response));
        
        if (response && response.choices && response.choices[0] && response.choices[0].message) {
            let aiResponse = response.choices[0].message.content || "I couldn't generate a response.";
            
            // Add sources if available
            if (sources.length > 0) {
                aiResponse += `\n\n📚 **Sources:**\n${sources.map(s => `• ${s}`).join('\n')}`;
            }
            
            console.log(`✅ Azure OpenAI response generated (${aiResponse.length} characters)`);
            return aiResponse;
        } else {
            console.error('❌ Unexpected response structure:', response);
            throw new Error('Invalid response structure from Azure OpenAI');
        }
        
    } catch (error) {
        console.error('❌ Azure OpenAI API error:', error);
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error status:', error.status);
        console.error('Error stack:', error.stack);
        
        // Provide more specific error messages
        if (error.status === 404) {
            throw new Error(`Azure OpenAI deployment '${deployment}' not found. Please check your deployment name.`);
        } else if (error.status === 401) {
            throw new Error('Invalid Azure OpenAI API key. Please check your credentials.');
        } else if (error.status === 429) {
            throw new Error('Azure OpenAI quota exceeded. Please check your usage limits.');
        } else if (error.status === 400) {
            throw new Error(`Azure OpenAI parameter error: ${error.message}`);
        } else if (error.message && error.message.includes('JSON')) {
            throw new Error(`JSON parsing error: ${error.message}. Check Azure App Service configuration.`);
        } else {
            throw new Error(`Azure OpenAI error: ${error.message}`);
        }
    }
}

// Add a helper function to detect the correct base URL:

function detectBaseUrl() {
    // Try multiple methods to get the correct Azure App Service URL
    if (process.env.WEBSITE_SITE_NAME) {
        // Method 1: Use WEBSITE_HOSTNAME (most reliable for Azure App Service)
        if (process.env.WEBSITE_HOSTNAME) {
            return `https://${process.env.WEBSITE_HOSTNAME}`;
        }
        
        // Method 2: Try to construct from available environment variables
        // Some Azure deployments have additional environment variables
        const possibleHosts = [
            process.env.HTTP_HOST,
            process.env.SERVER_NAME,
            process.env.WEBSITE_HOSTNAME,
            `${process.env.WEBSITE_SITE_NAME}.azurewebsites.net`
        ].filter(Boolean);
        
        if (possibleHosts.length > 0) {
            // Use the first available host
            const host = possibleHosts[0];
            return host.startsWith('http') ? host : `https://${host}`;
        }
        
        // Method 3: Fallback to basic construction
        return `https://${process.env.WEBSITE_SITE_NAME}.azurewebsites.net`;
    } else {
        // Local development
        return `http://localhost:${process.env.PORT || 3000}`;
    }
}

// Chat API endpoint with RAG support
app.post('/api/chat', async (req, res) => {
    const startTime = Date.now();
    
    // Set response headers early for Azure App Service
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    
    console.log('\n=== CHAT API REQUEST START ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Azure App Service:', process.env.WEBSITE_SITE_NAME ? 'YES' : 'NO');
    console.log('Request URL:', req.url);
    console.log('Request Method:', req.method);
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    try {
        // Validate request body exists and is parsed
        if (!req.body || typeof req.body !== 'object') {
            console.error('❌ Invalid request body:', req.body);
            return res.status(400).json({ 
                error: 'Invalid request body',
                details: 'Request body must be valid JSON',
                received: typeof req.body,
                timestamp: new Date().toISOString()
            });
        }

        const { message, useRAG = true, includeWebsiteContent = true } = req.body;
        
        if (!message || typeof message !== 'string' || !message.trim()) {
            console.error('❌ Invalid message:', message);
            return res.status(400).json({ 
                error: 'Message is required',
                details: 'Message must be a non-empty string',
                received: { message, type: typeof message },
                timestamp: new Date().toISOString()
            });
        }

        // Check configuration
        const useLocalModel = process.env.USE_LOCAL_MODEL === 'true';
        const localModelName = process.env.LOCAL_MODEL_NAME || 'distilgpt2';
        
        console.log('🔧 Configuration Check:');
        console.log('- Use Local Model:', useLocalModel);
        console.log('- Local Model Name:', localModelName);
        console.log('- Use RAG:', useRAG);
        console.log('- Include Website Content:', includeWebsiteContent);
        console.log('- Azure OpenAI Endpoint:', process.env.AZURE_OPENAI_ENDPOINT ? 'SET' : 'NOT SET');
        console.log('- Azure OpenAI Key:', process.env.AZURE_OPENAI_KEY ? 'SET' : 'NOT SET');
        console.log('- Azure OpenAI Deployment:', process.env.AZURE_OPENAI_DEPLOYMENT || 'NOT SET');

        if (useLocalModel) {
            // Local model handling (simplified for Azure)
            console.log('🤖 Attempting local model response...');
            
            try {
                // For Azure App Service, return a simple response if local models aren't working
                if (!localModel) {
                    console.log('⚠️ Local model not available, returning basic response');
                    return res.json({
                        response: "I'm currently running in cloud mode. Local models are not available in this deployment. Please configure Azure OpenAI for full functionality.",
                        metadata: {
                            duration: Date.now() - startTime,
                            model: 'fallback',
                            modelType: 'fallback',
                            timestamp: new Date().toISOString(),
                            source: 'fallback-response',
                            ragEnabled: false,
                            note: 'Local models not available in Azure App Service'
                        }
                    });
                }
                
                const aiResponse = await generateLocalResponseWithRAG(
                    message, 
                    localModelName, 
                    useRAG,
                    includeWebsiteContent
                );
                
                return res.json({
                    response: aiResponse,
                    metadata: {
                        duration: Date.now() - startTime,
                        model: localModelName,
                        modelType: 'local-transformers',
                        timestamp: new Date().toISOString(),
                        source: 'server-side-local',
                        ragEnabled: useRAG,
                        websiteContentIncluded: includeWebsiteContent
                    }
                });
                
            } catch (localError) {
                console.error('❌ Local model error:', localError);
                console.log('🔄 Falling back to Azure OpenAI...');
                // Continue to Azure OpenAI fallback
            }
        }

        // Azure OpenAI handling
        console.log('🌐 Using Azure OpenAI...');
        
        try {
            // Validate Azure OpenAI configuration
            const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
            const apiKey = process.env.AZURE_OPENAI_KEY;
            const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
            
            console.log('🔧 Azure OpenAI Config Check:');
            console.log('- Endpoint:', endpoint ? `${endpoint.substring(0, 30)}...` : 'NOT SET');
            console.log('- API Key:', apiKey ? `SET (${apiKey.length} chars)` : 'NOT SET');
            console.log('- Deployment:', deployment || 'NOT SET');
            
            if (!endpoint || !apiKey || !deployment) {
                const missing = [];
                if (!endpoint) missing.push('AZURE_OPENAI_ENDPOINT');
                if (!apiKey) missing.push('AZURE_OPENAI_KEY');
                if (!deployment) missing.push('AZURE_OPENAI_DEPLOYMENT');
                
                console.error('❌ Azure OpenAI configuration incomplete:', missing);
                
                return res.status(500).json({
                    error: 'Azure OpenAI not configured',
                    details: `Missing configuration: ${missing.join(', ')}`,
                    troubleshooting: 'Check Azure App Service Application Settings',
                    timestamp: new Date().toISOString(),
                    configurationHelp: {
                        step1: 'Go to Azure Portal > App Service > Configuration',
                        step2: 'Add Application Settings for Azure OpenAI credentials',
                        step3: 'Restart the App Service'
                    }
                });
            }
            
            // Initialize Azure OpenAI client with error handling
            if (!azureOpenAIClient) {
                console.log('🔧 Initializing Azure OpenAI client...');
                azureOpenAIClient = initializeAzureOpenAI();
                
                if (!azureOpenAIClient) {
                    console.error('❌ Failed to initialize Azure OpenAI client');
                    return res.status(500).json({
                        error: 'Azure OpenAI client initialization failed',
                        details: 'Unable to create Azure OpenAI client with provided credentials',
                        timestamp: new Date().toISOString(),
                        troubleshooting: 'Check Azure OpenAI service status and credentials'
                    });
                }
            }
            
            console.log('📝 Generating Azure OpenAI response...');
            
            const aiResponse = await generateAzureOpenAIResponseWithRAG(
                message, 
                useRAG,
                includeWebsiteContent
            );
            
            const duration = Date.now() - startTime;
            
            console.log('✅ SUCCESS: Response generated');
            console.log('Response length:', aiResponse.length);
            console.log('Duration:', duration + 'ms');
            
            const successResponse = {
                response: aiResponse,
                metadata: {
                    duration: duration,
                    model: deployment,
                    modelType: 'azure-openai',
                    timestamp: new Date().toISOString(),
                    source: 'azure-cloud',
                    ragEnabled: useRAG,
                    websiteContentIncluded: includeWebsiteContent,
                    endpoint: endpoint.split('.')[0] + '...' // Partially masked
                }
            };
            
            console.log('📤 Sending response:', JSON.stringify(successResponse, null, 2));
            return res.json(successResponse);
            
        } catch (azureError) {
            console.error('❌ Azure OpenAI error:', azureError);
            console.error('Error type:', azureError.constructor.name);
            console.error('Error message:', azureError.message);
            console.error('Error status:', azureError.status);
            
            return res.status(500).json({
                error: 'Azure OpenAI request failed',
                details: azureError.message,
                errorType: azureError.constructor.name,
                statusCode: azureError.status || 'unknown',
                timestamp: new Date().toISOString(),
                troubleshooting: 'Check Azure OpenAI service status and quota'
            });
        }
        
    } catch (error) {
        const duration = Date.now() - startTime;
        
        console.error('\n🚨 CRITICAL CHAT API ERROR 🚨');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('Request URL:', req.url);
        console.error('Request body:', req.body);
        console.error('Duration before error:', duration + 'ms');
        console.error('=== END CRITICAL ERROR ===\n');
        
        // Ensure we always return JSON
        const errorResponse = {
            error: 'Internal server error',
            details: error.message,
            errorType: error.constructor.name,
            timestamp: new Date().toISOString(),
            duration: duration,
            troubleshooting: 'Check Azure App Service logs for detailed error information'
        };
        
        console.log('📤 Sending error response:', JSON.stringify(errorResponse, null, 2));
        return res.status(500).json(errorResponse);
    } finally {
        console.log('=== CHAT API REQUEST END ===\n');
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
        const baseUrl = detectBaseUrl();
        
        console.log(`Auto-crawl starting for: ${baseUrl}`);
        console.log('Detection method used:', process.env.WEBSITE_HOSTNAME ? 'WEBSITE_HOSTNAME' : 
                    process.env.HTTP_HOST ? 'HTTP_HOST' : 
                    process.env.WEBSITE_SITE_NAME ? 'WEBSITE_SITE_NAME fallback' : 'localhost');
        
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
            maxPages: process.env.WEBSITE_MAX_PAGES ? parseInt(process.env.WEBSITE_MAX_PAGES) : 20,
            respectRobots: false, // Skip robots.txt for own site
            includeExternalLinks: false,
            crawlDelay: process.env.WEBSITE_CRAWL_DELAY ? parseInt(process.env.WEBSITE_CRAWL_DELAY) : 500
        }).catch(error => {
            console.error('Auto-crawl failed:', error);
        });
        
        res.json({
            success: true,
            message: 'Auto-crawl started for current website',
            baseUrl: baseUrl,
            environment: process.env.WEBSITE_SITE_NAME ? 'Azure App Service' : 'Local',
            detectionMethod: process.env.WEBSITE_HOSTNAME ? 'WEBSITE_HOSTNAME' : 
                           process.env.HTTP_HOST ? 'HTTP_HOST' : 
                           process.env.WEBSITE_SITE_NAME ? 'WEBSITE_SITE_NAME' : 'localhost'
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Failed to start auto-crawl',
            details: error.message
        });
    }
});

// Replace the GET auto-crawl endpoint:
app.get('/api/website/auto-crawl', async (req, res) => {
    try {
        const baseUrl = detectBaseUrl();
        
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
            maxPages: process.env.WEBSITE_MAX_PAGES ? parseInt(process.env.WEBSITE_MAX_PAGES) : 20,
            respectRobots: false, // Skip robots.txt for own site
            includeExternalLinks: false,
            crawlDelay: process.env.WEBSITE_CRAWL_DELAY ? parseInt(process.env.WEBSITE_CRAWL_DELAY) : 500
        }).catch(error => {
            console.error('Auto-crawl failed:', error);
        });
        
        res.json({
            success: true,
            message: 'Auto-crawl started for current website',
            baseUrl: baseUrl,
            environment: process.env.WEBSITE_SITE_NAME ? 'Azure App Service' : 'Local',
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
        azureOpenAIConfigured: !!(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_DEPLOYMENT),
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
            azureOpenAI: !!azureOpenAIClient  // This is what the admin panel is checking
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

// Add this enhanced debug endpoint (replace the existing one):
app.get('/api/debug/azure-config', (req, res) => {
    // Check if we're running in Azure App Service
    const isAzureAppService = process.env.WEBSITE_SITE_NAME || process.env.APPSETTING_WEBSITE_SITE_NAME;
    
    res.json({
        environment: {
            isAzureAppService: !!isAzureAppService,
            siteName: process.env.WEBSITE_SITE_NAME || 'not set',
            nodeEnv: process.env.NODE_ENV || 'not set'
        },
        azureOpenAI: {
            endpoint: process.env.AZURE_OPENAI_ENDPOINT ? 'SET' : 'NOT SET',
            endpointValue: process.env.AZURE_OPENAI_ENDPOINT ? process.env.AZURE_OPENAI_ENDPOINT.substring(0, 30) + '...' : 'undefined',
            key: process.env.AZURE_OPENAI_KEY ? 'SET (length: ' + process.env.AZURE_OPENAI_KEY.length + ')' : 'NOT SET',
            deployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'NOT SET',
            version: process.env.AZURE_OPENAI_VERSION || 'NOT SET',
            useLocalModel: process.env.USE_LOCAL_MODEL || 'NOT SET'
        },
        clientStatus: {
            initialized: !!azureOpenAIClient,
            clientType: azureOpenAIClient ? typeof azureOpenAIClient : 'null'
        },
        allAzureEnvKeys: Object.keys(process.env).filter(key => key.includes('AZURE')).sort(),
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

// Add a debug endpoint to check URL detection:

app.get('/api/debug/url-detection', (req, res) => {
    const detectedUrl = detectBaseUrl();
    
    res.json({
        detectedUrl: detectedUrl,
        environment: process.env.WEBSITE_SITE_NAME ? 'Azure App Service' : 'Local Development',
        availableEnvironmentVars: {
            WEBSITE_SITE_NAME: process.env.WEBSITE_SITE_NAME || 'not set',
            WEBSITE_HOSTNAME: process.env.WEBSITE_HOSTNAME || 'not set',
            HTTP_HOST: process.env.HTTP_HOST || 'not set',
            SERVER_NAME: process.env.SERVER_NAME || 'not set',
            PORT: process.env.PORT || 'not set'
        },
        requestHeaders: req.headers.host ? {
            host: req.headers.host,
            'x-forwarded-host': req.headers['x-forwarded-host'],
            'x-original-host': req.headers['x-original-host']
        } : {},
        detectionMethod: process.env.WEBSITE_HOSTNAME ? 'WEBSITE_HOSTNAME (most reliable)' : 
                        process.env.HTTP_HOST ? 'HTTP_HOST' : 
                        process.env.WEBSITE_SITE_NAME ? 'WEBSITE_SITE_NAME fallback' : 'localhost',
        timestamp: new Date().toISOString()
    });
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

// Initialize Azure OpenAI client on startup if configured and not using local model
async function initializeServicesOnStartup() {
    console.log('\n🚀 INITIALIZING SERVICES 🚀');
    console.log('Environment:', process.env.NODE_ENV || 'not set');
    console.log('Azure App Service:', process.env.WEBSITE_SITE_NAME ? 'YES (' + process.env.WEBSITE_SITE_NAME + ')' : 'NO');
    console.log('Use Local Model:', process.env.USE_LOCAL_MODEL);
    
    // Detect and log the base URL
    const detectedUrl = detectBaseUrl();
    console.log('Detected Base URL:', detectedUrl);
    
    const useLocalModel = process.env.USE_LOCAL_MODEL === 'true';
    const isAzureAppService = !!process.env.WEBSITE_SITE_NAME;
    
    if (isAzureAppService) {
        console.log('🌐 Azure App Service mode - optimizing for cloud deployment');
        
        // Force Azure OpenAI mode in App Service
        process.env.USE_LOCAL_MODEL = 'false';
        
        // Initialize Azure OpenAI only
        try {
            const requiredVars = ['AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_KEY', 'AZURE_OPENAI_DEPLOYMENT'];
            const missing = requiredVars.filter(varName => !process.env[varName]);
            
            if (missing.length > 0) {
                console.error('❌ Missing Azure OpenAI environment variables:', missing);
                console.error('Please configure these in Azure App Service Application Settings');
                return;
            }
            
            azureOpenAIClient = initializeAzureOpenAI();
            if (azureOpenAIClient) {
                console.log('✅ Azure OpenAI client ready for production');
            } else {
                console.error('❌ Azure OpenAI client initialization failed');
            }
        } catch (error) {
            console.error('❌ Azure OpenAI startup error:', error);
        }
        
        // Skip embedder and transformers entirely in Azure App Service
        console.log('⏭️ Skipping embedder initialization in Azure App Service');
        console.log('💡 Using Azure OpenAI for all functionality');
        
    } else {
        // Local development - always try to initialize embedder for RAG
        console.log('🖥️ Local development environment');
        
        // Load transformers for embeddings (needed for RAG even with Azure OpenAI)
        await conditionallyLoadTransformers();
        
        if (!useLocalModel) {
            console.log('🌐 Local development with Azure OpenAI...');
            try {
                azureOpenAIClient = initializeAzureOpenAI();
                if (azureOpenAIClient) {
                    console.log('✅ Azure OpenAI client ready');
                }
            } catch (error) {
                console.error('❌ Azure OpenAI initialization error:', error);
            }
        } else {
            console.log('🤖 Local model mode enabled');
            const modelName = process.env.LOCAL_MODEL_NAME || 'distilgpt2';
            await initializeLocalModel(modelName);
        }
        
        // Try to initialize embedder for RAG (local development)
        try {
            console.log('🔧 Initializing embedder for RAG...');
            await initializeEmbedder();
            if (embedder) {
                console.log('✅ Embedder ready for RAG functionality');
            } else {
                console.log('⚠️ Embedder not available - will use text search fallback');
            }
        } catch (error) {
            console.error('⚠️ Embedder initialization failed:', error.message);
            console.log('📝 Website crawling will work without embeddings');
        }
    }
    
    // Auto-crawl website if enabled
    if (process.env.WEBSITE_AUTO_CRAWL === 'true') {
        console.log('🕷️ Starting auto-crawl of website...');
        setTimeout(async () => {
            try {
                const baseUrl = detectBaseUrl();
                console.log('Auto-crawl target URL:', baseUrl);
                
                await crawlAndIndexWebsite(baseUrl, {
                    maxPages: process.env.WEBSITE_MAX_PAGES ? parseInt(process.env.WEBSITE_MAX_PAGES) : 20,
                    respectRobots: false,
                    includeExternalLinks: false,
                    crawlDelay: process.env.WEBSITE_CRAWL_DELAY ? parseInt(process.env.WEBSITE_CRAWL_DELAY) : 1000
                });
                
                console.log('✅ Auto-crawl completed successfully');
            } catch (error) {
                console.error('❌ Auto-crawl failed:', error);
            }
        }, 5000); // Wait 5 seconds after startup
    }
    
    console.log('🚀 STARTUP COMPLETE 🚀\n');
}

// Run initialization on startup
initializeServicesOnStartup().catch(console.error);