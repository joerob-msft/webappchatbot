const express = require('express');
const router = express.Router();
const { useLocalModel } = require('../config/environment');
const { generateAzureOpenAIResponseWithRAG } = require('../services/ragService');
const { generateLocalResponseWithRAG, getLocalModel, getModelError } = require('../models/localModels');
const { getAzureOpenAIClient } = require('../models/azureOpenAI');
const { logSuccess, logError } = require('../utils/logger');

router.post('/', async (req, res) => {
    const startTime = Date.now();
    
    // Set response headers early for Azure App Service
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    
    console.log('\n=== CHAT API REQUEST START ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    try {
        // Validate request body
        if (!req.body || typeof req.body !== 'object') {
            logError('Invalid request body');
            return res.status(400).json({ 
                error: 'Invalid request body',
                details: 'Request body must be valid JSON',
                received: typeof req.body,
                timestamp: new Date().toISOString()
            });
        }

        const { message, useRAG = true, includeWebsiteContent = true } = req.body;
        
        if (!message || typeof message !== 'string' || !message.trim()) {
            logError('Invalid message');
            return res.status(400).json({ 
                error: 'Message is required',
                details: 'Message must be a non-empty string',
                received: { message, type: typeof message },
                timestamp: new Date().toISOString()
            });
        }

        // Check configuration
        const localModelName = process.env.LOCAL_MODEL_NAME || 'distilgpt2';
        
        console.log('🔧 Configuration Check:');
        console.log('- Use Local Model:', useLocalModel);
        console.log('- Local Model Name:', localModelName);
        console.log('- Use RAG:', useRAG);
        console.log('- Include Website Content:', includeWebsiteContent);

        if (useLocalModel) {
            // Local model handling
            console.log('🤖 Attempting local model response...');
            
            try {
                const localModel = getLocalModel();
                const modelError = getModelError();
                
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
                            note: modelError || 'Local models not available'
                        }
                    });
                }
                
                const aiResponse = await generateLocalResponseWithRAG(
                    message, 
                    localModelName, 
                    useRAG,
                    includeWebsiteContent
                );
                
                logSuccess('Local model response generated');
                
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
                logError(`Local model error: ${localError.message}`);
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
                
                logError(`Azure OpenAI configuration incomplete: ${missing.join(', ')}`);
                
                return res.status(500).json({
                    error: 'Azure OpenAI not configured',
                    details: `Missing configuration: ${missing.join(', ')}`,
                    troubleshooting: 'Check Azure App Service Application Settings',
                    timestamp: new Date().toISOString()
                });
            }
            
            const azureOpenAIClient = getAzureOpenAIClient();
            if (!azureOpenAIClient) {
                logError('Azure OpenAI client not available');
                return res.status(500).json({
                    error: 'Azure OpenAI client initialization failed',
                    details: 'Unable to create Azure OpenAI client with provided credentials',
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log('📝 Generating Azure OpenAI response...');
            
            const aiResponse = await generateAzureOpenAIResponseWithRAG(
                message, 
                useRAG,
                includeWebsiteContent
            );
            
            const duration = Date.now() - startTime;
            
            logSuccess(`Response generated in ${duration}ms`);
            
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
            
            return res.json(successResponse);
            
        } catch (azureError) {
            logError(`Azure OpenAI error: ${azureError.message}`);
            
            return res.status(500).json({
                error: 'Azure OpenAI request failed',
                details: azureError.message,
                errorType: azureError.constructor.name,
                statusCode: azureError.status || 'unknown',
                timestamp: new Date().toISOString()
            });
        }
        
    } catch (error) {
        const duration = Date.now() - startTime;
        
        logError(`Critical chat API error: ${error.message}`);
        
        const errorResponse = {
            error: 'Internal server error',
            details: error.message,
            errorType: error.constructor.name,
            timestamp: new Date().toISOString(),
            duration: duration
        };
        
        return res.status(500).json(errorResponse);
    } finally {
        console.log('=== CHAT API REQUEST END ===\n');
    }
});

module.exports = router;