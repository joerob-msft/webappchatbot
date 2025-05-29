const express = require('express');
const router = express.Router();
const { getLocalModel, getModelLoading, getModelError } = require('../models/localModels');
const { getAzureOpenAIClient } = require('../models/azureOpenAI');
const { getDocumentStore, getDocumentEmbeddings, getEmbedder } = require('../services/ragService');
const { detectBaseUrl } = require('../utils/urlUtils');

// Add this to the top of your debug routes to ensure proper error handling
router.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    next();
});

// Health check endpoint
router.get('/health', (req, res) => {
    const localModel = getLocalModel();
    const modelLoading = getModelLoading();
    const modelError = getModelError();
    const embedder = getEmbedder();
    const azureOpenAIClient = getAzureOpenAIClient();
    const documentStore = getDocumentStore();
    const documentEmbeddings = getDocumentEmbeddings();
    
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
            azureOpenAI: !!azureOpenAIClient
        },
        rag: {
            documents: documentStore.length,
            chunks: documentEmbeddings.length,
            websitePages: documentEmbeddings.filter(d => d.type === 'website').length
        }
    });
});

// Update the /env route to be more robust
router.get('/env', (req, res) => {
    try {
        const debugInfo = {
            USE_LOCAL_MODEL: process.env.USE_LOCAL_MODEL || 'not set',
            LOCAL_MODEL_NAME: process.env.LOCAL_MODEL_NAME || 'not set',
            NODE_ENV: process.env.NODE_ENV || 'not set',
            PORT: process.env.PORT || 'not set',
            NODE_VERSION: process.version,
            PLATFORM: process.platform,
            MEMORY_USAGE: process.memoryUsage(),
            WEBSITE_AUTO_CRAWL: process.env.WEBSITE_AUTO_CRAWL || 'not set',
            RAG_CHUNK_SIZE: process.env.RAG_CHUNK_SIZE || 'not set',
            timestamp: new Date().toISOString()
        };
        
        console.log('Returning environment debug info:', debugInfo);
        res.json(debugInfo);
        
    } catch (error) {
        console.error('Error in /env endpoint:', error);
        res.status(500).json({
            error: 'Failed to get environment info',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Azure configuration debug endpoint
router.get('/azure-config', (req, res) => {
    const isAzureAppService = process.env.WEBSITE_SITE_NAME || process.env.APPSETTING_WEBSITE_SITE_NAME;
    const azureOpenAIClient = getAzureOpenAIClient();
    
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

// URL detection debug endpoint
router.get('/url-detection', (req, res) => {
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

module.exports = router;