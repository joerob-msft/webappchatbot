const { isAzureAppService, useLocalModel, websiteAutoCrawl, websiteMaxPages, websiteCrawlDelay } = require('../config/environment');
const { initializeAzureOpenAI } = require('../models/azureOpenAI');
const { initializeLocalModel, conditionallyLoadTransformers } = require('../models/localModels');
const { initializeEmbedder } = require('../services/ragService');
const { crawlAndIndexWebsite } = require('../services/crawling');
const { detectBaseUrl } = require('../utils/urlUtils');
const { logSuccess, logWarning, logError } = require('../utils/logger');

async function initializeServices() {
    console.log('\n🚀 INITIALIZING SERVICES 🚀');
    console.log('Environment:', process.env.NODE_ENV || 'not set');
    console.log('Azure App Service:', isAzureAppService ? 'YES (' + process.env.WEBSITE_SITE_NAME + ')' : 'NO');
    console.log('Use Local Model:', useLocalModel);
    
    // Detect and log the base URL
    const detectedUrl = detectBaseUrl();
    console.log('Detected Base URL:', detectedUrl);
    
    if (isAzureAppService) {
        console.log('🌐 Azure App Service mode - optimizing for cloud deployment');
        
        // Force Azure OpenAI mode in App Service
        process.env.USE_LOCAL_MODEL = 'false';
        
        // Initialize Azure OpenAI only
        try {
            const requiredVars = ['AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_KEY', 'AZURE_OPENAI_DEPLOYMENT'];
            const missing = requiredVars.filter(varName => !process.env[varName]);
            
            if (missing.length > 0) {
                logError(`Missing Azure OpenAI environment variables: ${missing.join(', ')}`);
                console.error('Please configure these in Azure App Service Application Settings');
                return;
            }
            
            const azureOpenAIClient = initializeAzureOpenAI();
            if (azureOpenAIClient) {
                logSuccess('Azure OpenAI client ready for production');
            } else {
                logError('Azure OpenAI client initialization failed');
            }
        } catch (error) {
            logError(`Azure OpenAI startup error: ${error.message}`);
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
                const azureOpenAIClient = initializeAzureOpenAI();
                if (azureOpenAIClient) {
                    logSuccess('Azure OpenAI client ready');
                }
            } catch (error) {
                logError(`Azure OpenAI initialization error: ${error.message}`);
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
            const embedder = require('../services/ragService').getEmbedder();
            if (embedder) {
                logSuccess('Embedder ready for RAG functionality');
            } else {
                logWarning('Embedder not available - will use text search fallback');
            }
        } catch (error) {
            logWarning(`Embedder initialization failed: ${error.message}`);
            console.log('📝 Website crawling will work without embeddings');
        }
    }
    
    // Auto-crawl website if enabled
    if (websiteAutoCrawl) {
        console.log('🕷️ Starting auto-crawl of website...');
        setTimeout(async () => {
            try {
                const baseUrl = detectBaseUrl();
                console.log('Auto-crawl target URL:', baseUrl);
                
                await crawlAndIndexWebsite(baseUrl, {
                    maxPages: websiteMaxPages,
                    respectRobots: false,
                    includeExternalLinks: false,
                    crawlDelay: websiteCrawlDelay
                });
                
                logSuccess('Auto-crawl completed successfully');
            } catch (error) {
                logError(`Auto-crawl failed: ${error.message}`);
            }
        }, 5000); // Wait 5 seconds after startup
    }
    
    console.log('🚀 STARTUP COMPLETE 🚀\n');
}

module.exports = { initializeServices };