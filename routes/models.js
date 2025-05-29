const express = require('express');
const router = express.Router();
const { initializeLocalModel, getLocalModel, getModelLoading, getModelError } = require('../models/localModels');
const { initializeAzureOpenAI, generateAzureOpenAIResponse, getAzureOpenAIClient } = require('../models/azureOpenAI');
const { getLocalModelInfo } = require('../models/modelInfo');
const { getEmbedder } = require('../services/ragService');
const { logSuccess, logError } = require('../utils/logger');

// Initialize local model
router.post('/initialize', async (req, res) => {
    try {
        const { modelName } = req.body;
        const targetModel = modelName || process.env.LOCAL_MODEL_NAME || 'distilgpt2';
        
        console.log(`Manual model initialization requested: ${targetModel}`);
        
        const success = await initializeLocalModel(targetModel);
        
        if (success) {
            logSuccess(`Model ${targetModel} initialized successfully`);
            res.json({
                success: true,
                message: `Model ${targetModel} initialized successfully`,
                model: targetModel,
                info: getLocalModelInfo(targetModel)
            });
        } else {
            const modelError = getModelError();
            logError(`Model initialization failed: ${modelError}`);
            res.status(500).json({
                success: false,
                error: 'Model initialization failed',
                details: modelError
            });
        }
    } catch (error) {
        logError(`Model initialization error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Model initialization error',
            details: error.message
        });
    }
});

// Get model status
router.get('/status', (req, res) => {
    const modelName = process.env.LOCAL_MODEL_NAME || 'distilgpt2';
    const localModel = getLocalModel();
    const modelLoading = getModelLoading();
    const modelError = getModelError();
    const embedder = getEmbedder();
    
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

// Test model download
router.post('/test-download', async (req, res) => {
    const { modelName } = req.body;
    const testModel = modelName || 'Xenova/LaMini-Flan-T5-248M';
    
    try {
        console.log(`Testing download for model: ${testModel}`);
        
        // Try to load just the tokenizer first (faster test)
        const { AutoTokenizer } = await import('@xenova/transformers');
        const tokenizer = await AutoTokenizer.from_pretrained(testModel);
        
        logSuccess(`Model ${testModel} is accessible`);
        
        res.json({
            success: true,
            message: `Model ${testModel} is accessible`,
            modelName: testModel,
            tokenizerReady: !!tokenizer
        });
        
    } catch (error) {
        logError(`Model download test failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Model download test failed',
            modelName: testModel,
            details: error.message
        });
    }
});

// Test Azure OpenAI connection
router.post('/azure-openai/test', async (req, res) => {
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
        
        let azureOpenAIClient = getAzureOpenAIClient();
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
        
        const response = await generateAzureOpenAIResponse(testMessage);
        
        logSuccess('Azure OpenAI connection test successful');
        
        res.json({
            success: true,
            message: 'Azure OpenAI connection successful',
            deployment: deployment,
            testResponse: response,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logError(`Azure OpenAI test failed: ${error.message}`);
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

module.exports = router;