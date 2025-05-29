const express = require('express');
const path = require('path');
const app = express();

// Add Transformers.js import
let pipeline;
(async () => {
    const { pipeline: importedPipeline } = await import('@xenova/transformers');
    pipeline = importedPipeline;
})();

// Add model loading state
let localModel = null;
let modelLoading = false;
let modelError = null;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Enhanced logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Local model configurations
function getLocalModelInfo(modelName) {
    const models = {
        'distilgpt2': {
            task: 'text-generation',
            name: 'Xenova/distilgpt2',
            type: 'generation',
            size: 'small',
            description: 'Fast, lightweight text generation'
        },
        'gpt2': {
            task: 'text-generation',
            name: 'Xenova/gpt2',
            type: 'generation',
            size: 'medium',
            description: 'Standard GPT-2 model'
        },
        'distilbert-sentiment': {
            task: 'sentiment-analysis',
            name: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
            type: 'sentiment',
            size: 'small',
            description: 'Sentiment analysis with conversational response'
        },
        'bert-qa': {
            task: 'question-answering',
            name: 'Xenova/distilbert-base-cased-distilled-squad',
            type: 'qa',
            size: 'small',
            description: 'Question answering model'
        },
        'flan-t5-small': {
            task: 'text2text-generation',
            name: 'Xenova/flan-t5-small',
            type: 'text2text',
            size: 'small',
            description: 'Instruction-following text generation'
        }
    };
    
    return models[modelName] || models['distilgpt2'];
}

// Initialize local model
async function initializeLocalModel(modelName = 'distilgpt2') {
    if (modelLoading) {
        console.log('Model already loading...');
        return false;
    }
    
    if (!pipeline) {
        console.log('Pipeline not ready yet, waiting...');
        return false;
    }
    
    try {
        modelLoading = true;
        modelError = null;
        console.log(`\n=== INITIALIZING LOCAL MODEL: ${modelName} ===`);
        
        const modelInfo = getLocalModelInfo(modelName);
        console.log('Model info:', modelInfo);
        
        console.log('Loading model... This may take a few minutes on first run.');
        localModel = await pipeline(modelInfo.task, modelInfo.name);
        
        console.log('✅ Local model loaded successfully!');
        console.log('=== MODEL INITIALIZATION COMPLETE ===\n');
        modelLoading = false;
        return true;
        
    } catch (error) {
        console.error('❌ Failed to load local model:', error);
        modelError = error.message;
        modelLoading = false;
        localModel = null;
        return false;
    }
}

// Generate response using local model
async function generateLocalResponse(message, modelName = 'distilgpt2') {
    if (!localModel) {
        throw new Error('Local model not initialized');
    }
    
    const modelInfo = getLocalModelInfo(modelName);
    
    try {
        if (modelInfo.task === 'text-generation') {
            const result = await localModel(message, {
                max_new_tokens: 100,
                temperature: 0.7,
                do_sample: true,
                return_full_text: false
            });
            
            return result[0].generated_text.trim();
            
        } else if (modelInfo.task === 'sentiment-analysis') {
            const result = await localModel(message);
            const sentiment = result[0];
            return `I analyzed your message sentiment as ${sentiment.label.toLowerCase()} (${(sentiment.score * 100).toFixed(1)}% confidence). How can I help you further?`;
            
        } else if (modelInfo.task === 'question-answering') {
            // For Q&A, we need a context. Using a general context
            const context = "I am a helpful AI assistant designed to answer questions and have conversations. I can help with various topics including general knowledge, explanations, and problem-solving.";
            const result = await localModel({
                question: message,
                context: context
            });
            
            return result.answer || "I'm not sure about that specific question. Could you provide more context or try rephrasing?";
            
        } else if (modelInfo.task === 'text2text-generation') {
            const result = await localModel(message, {
                max_new_tokens: 100
            });
            
            return result[0].generated_text.trim();
        }
        
        return "I received your message but couldn't process it with the current model configuration.";
        
    } catch (error) {
        console.error('Error generating local response:', error);
        throw error;
    }
}

function getModelInfo(deploymentName) {
    const name = deploymentName.toLowerCase();
    
    // o1 Series Models
    if (name.includes('o1-mini') || name.includes('o1-preview') || name.match(/^o1$/)) {
        return {
            series: 'o1',
            type: 'reasoning',
            supportsSystemRole: false,
            tokenParam: 'max_completion_tokens',
            supportsTemperature: false,
            requiredApiVersion: '2024-12-01-preview',
            maxTokens: 65536
        };
    }
    
    // GPT-4 Series
    if (name.includes('gpt-4')) {
        return {
            series: 'gpt-4',
            type: 'chat',
            supportsSystemRole: true,
            tokenParam: 'max_tokens',
            supportsTemperature: true,
            requiredApiVersion: '2024-08-01-preview',
            maxTokens: name.includes('32k') ? 32768 : 
                      name.includes('turbo') || name.includes('4o') ? 128000 : 8192
        };
    }
    
    // GPT-3.5 Series
    if (name.includes('gpt-35') || name.includes('gpt-3.5')) {
        return {
            series: 'gpt-3.5',
            type: 'chat',
            supportsSystemRole: true,
            tokenParam: 'max_tokens',
            supportsTemperature: true,
            requiredApiVersion: '2024-08-01-preview',
            maxTokens: name.includes('16k') ? 16384 : 4096
        };
    }
    
    // Default for unknown models (assume GPT-like)
    return {
        series: 'unknown',
        type: 'chat',
        supportsSystemRole: true,
        tokenParam: 'max_tokens',
        supportsTemperature: true,
        requiredApiVersion: '2024-08-01-preview',
        maxTokens: 4096
    };
}

function isO1Model(deploymentName) {
    return getModelInfo(deploymentName).series === 'o1';
}

// Helper function to get appropriate API version for model
function getApiVersion(deploymentName) {
    const modelInfo = getModelInfo(deploymentName);
    return process.env.AZURE_OPENAI_VERSION || modelInfo.requiredApiVersion;
}

// Helper function to build messages array based on model type
function buildMessages(userMessage, deploymentName) {
    const modelInfo = getModelInfo(deploymentName);
    
    if (modelInfo.supportsSystemRole) {
        return [
            {
                role: 'system',
                content: 'You are a helpful AI assistant.'
            },
            {
                role: 'user',
                content: userMessage
            }
        ];
    } else {
        return [
            {
                role: 'user',
                content: userMessage
            }
        ];
    }
}

// Helper function to get model-specific parameters
function getModelParameters(deploymentName) {
    const modelInfo = getModelInfo(deploymentName);
    const baseParams = {};
    
    // Set token limit parameter
    baseParams[modelInfo.tokenParam] = Math.min(1000, modelInfo.maxTokens);
    
    // Add temperature and other parameters if supported
    if (modelInfo.supportsTemperature) {
        baseParams.temperature = 0.7;
        baseParams.top_p = 0.95;
        baseParams.frequency_penalty = 0;
        baseParams.presence_penalty = 0;
    }
    
    return baseParams;
}

// Enhanced Chat API endpoint with local model support
app.post('/api/chat', async (req, res) => {
    const startTime = Date.now();
    console.log('\n=== CHAT API REQUEST START ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    try {
        const { message } = req.body;
        
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
        console.log('- Model Loading:', modelLoading);
        console.log('- Model Loaded:', !!localModel);
        console.log('- Model Error:', modelError);

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
            
            // Generate response using local model
            if (localModel) {
                console.log('Generating response with local model...');
                
                try {
                    const aiResponse = await generateLocalResponse(message, localModelName);
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
                            modelInfo: getLocalModelInfo(localModelName)
                        }
                    });
                    
                } catch (error) {
                    console.error('Error with local model:', error);
                    return res.status(500).json({
                        error: 'Local model inference failed',
                        details: error.message,
                        troubleshooting: 'The local model encountered an error during inference'
                    });
                }
            }
        }

        // Fall back to existing Azure OpenAI logic
        console.log('Using Azure OpenAI...');

        // Check environment variables with detailed logging
        const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
        const apiKey = process.env.AZURE_OPENAI_KEY;
        const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
        
        console.log('Environment Variables Check:');
        console.log('- AZURE_OPENAI_ENDPOINT:', endpoint ? `${endpoint.substring(0, 20)}...` : 'NOT SET');
        console.log('- AZURE_OPENAI_KEY:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT SET');
        console.log('- AZURE_OPENAI_DEPLOYMENT:', deployment || 'NOT SET');
        
        if (!endpoint || !apiKey || !deployment) {
            const missing = [];
            if (!endpoint) missing.push('AZURE_OPENAI_ENDPOINT');
            if (!apiKey) missing.push('AZURE_OPENAI_KEY');
            if (!deployment) missing.push('AZURE_OPENAI_DEPLOYMENT');
            
            return res.status(500).json({ 
                error: 'Configuration Error: Missing environment variables',
                details: `Missing: ${missing.join(', ')}`,
                configHelp: 'Set the missing environment variables in your Azure Web App configuration'
            });
        }

        // Determine model type and get appropriate settings
        const isO1 = isO1Model(deployment);
        const apiVersion = getApiVersion(deployment);
        const messages = buildMessages(message, deployment);
        const modelParams = getModelParameters(deployment);
        
        console.log('Model Analysis:');
        console.log('- Deployment:', deployment);
        console.log('- Is o1 Model:', isO1);
        console.log('- API Version:', apiVersion);
        console.log('- Message format:', JSON.stringify(messages, null, 2));
        console.log('- Model parameters:', JSON.stringify(modelParams, null, 2));

        // Build Azure OpenAI API URL
        const azureUrl = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
        console.log('Azure OpenAI URL:', azureUrl);

        // Prepare request payload with model-specific parameters
        const requestPayload = {
            messages: messages,
            ...modelParams
        };
        
        console.log('Request payload:', JSON.stringify(requestPayload, null, 2));
        console.log('Making request to Azure OpenAI...');

        const response = await fetch(azureUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey
            },
            body: JSON.stringify(requestPayload)
        });

        console.log('Azure OpenAI Response Status:', response.status);
        console.log('Azure OpenAI Response Headers:', Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
            const errorText = await response.text();
            console.log('Azure OpenAI Error Response Body:', errorText);
            
            let errorDetails;
            try {
                errorDetails = JSON.parse(errorText);
            } catch (e) {
                errorDetails = { message: errorText };
            }
            
            console.log('ERROR: Azure OpenAI API failed');
            console.log('Status:', response.status);
            console.log('Error details:', errorDetails);
            
            return res.status(500).json({ 
                error: `Azure OpenAI API Error (${response.status})`,
                details: errorDetails,
                azureUrl: azureUrl.replace(apiKey, '***'),
                modelInfo: {
                    deployment: deployment,
                    isO1Model: isO1,
                    apiVersion: apiVersion
                },
                troubleshooting: getErrorTroubleshooting(response.status, errorDetails, isO1)
            });
        }

        const data = await response.json();
        console.log('Azure OpenAI Success Response:', JSON.stringify(data, null, 2));
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            console.log('ERROR: Unexpected response structure from Azure OpenAI');
            return res.status(500).json({ 
                error: 'Unexpected response structure from Azure OpenAI',
                details: data,
                troubleshooting: 'The API response did not contain the expected message structure'
            });
        }

        const aiResponse = data.choices[0].message.content;
        const duration = Date.now() - startTime;
        
        console.log('SUCCESS: Chat API completed');
        console.log('Response length:', aiResponse.length);
        console.log('Duration:', duration + 'ms');
        console.log('=== CHAT API REQUEST END ===\n');

        res.json({ 
            response: aiResponse,
            metadata: {
                duration: duration,
                model: deployment,
                modelType: isO1 ? 'o1-series' : 'gpt-series',
                timestamp: new Date().toISOString(),
                usage: data.usage,
                source: 'azure-openai'
            }
        });

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

// Model management endpoints
app.post('/api/model/initialize', async (req, res) => {
    const { modelName } = req.body;
    const targetModel = modelName || process.env.LOCAL_MODEL_NAME || 'distilgpt2';
    
    console.log(`\n=== MODEL INITIALIZATION REQUEST ===`);
    console.log('Target model:', targetModel);
    
    if (modelLoading) {
        return res.status(409).json({
            error: 'Model already loading',
            details: 'A model is currently being initialized'
        });
    }
    
    const success = await initializeLocalModel(targetModel);
    
    res.json({
        success: success,
        model: targetModel,
        status: success ? 'loaded' : 'failed',
        error: modelError,
        timestamp: new Date().toISOString(),
        modelInfo: success ? getLocalModelInfo(targetModel) : null
    });
});

app.get('/api/model/status', (req, res) => {
    const useLocalModel = process.env.USE_LOCAL_MODEL === 'true';
    const localModelName = process.env.LOCAL_MODEL_NAME || 'distilgpt2';
    const modelInfo = getLocalModelInfo(localModelName);
    
    res.json({
        configuration: {
            useLocal: useLocalModel,
            modelName: localModelName
        },
        model: localModelName,
        modelInfo: modelInfo,
        status: {
            loaded: !!localModel,
            loading: modelLoading,
            error: modelError,
            pipelineReady: !!pipeline
        },
        availableModels: [
            'distilgpt2',
            'gpt2', 
            'distilbert-sentiment',
            'bert-qa',
            'flan-t5-small'
        ],
        timestamp: new Date().toISOString()
    });
});

app.get('/api/system/memory', (req, res) => {
    const usage = process.memoryUsage();
    res.json({
        memory: {
            rss: `${Math.round(usage.rss / 1024 / 1024)} MB`,
            heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)} MB`,
            heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)} MB`,
            external: `${Math.round(usage.external / 1024 / 1024)} MB`
        },
        timestamp: new Date().toISOString()
    });
});

// Enhanced health check endpoint
app.get('/api/health', (req, res) => {
    console.log('\n=== HEALTH CHECK REQUEST ===');
    
    const useLocalModel = process.env.USE_LOCAL_MODEL === 'true';
    const localModelName = process.env.LOCAL_MODEL_NAME || 'distilgpt2';
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
    const isO1 = deployment ? isO1Model(deployment) : false;
    const apiVersion = deployment ? getApiVersion(deployment) : null;
    
    // Azure configuration check
    const azureConfig = {
        endpoint: {
            set: !!process.env.AZURE_OPENAI_ENDPOINT,
            value: process.env.AZURE_OPENAI_ENDPOINT ? 
                   `${process.env.AZURE_OPENAI_ENDPOINT.substring(0, 30)}...` : 
                   null
        },
        apiKey: {
            set: !!process.env.AZURE_OPENAI_KEY,
            length: process.env.AZURE_OPENAI_KEY ? process.env.AZURE_OPENAI_KEY.length : 0
        },
        deployment: {
            set: !!deployment,
            value: deployment || null,
            isO1Model: isO1,
            recommendedApiVersion: apiVersion
        },
        apiVersion: process.env.AZURE_OPENAI_VERSION || 'auto-detected'
    };
    
    // Local model status
    const localModelStatus = {
        enabled: useLocalModel,
        modelName: localModelName,
        loaded: !!localModel,
        loading: modelLoading,
        error: modelError,
        pipelineReady: !!pipeline,
        modelInfo: useLocalModel ? getLocalModelInfo(localModelName) : null
    };
    
    const azureConfigured = azureConfig.endpoint.set && azureConfig.apiKey.set && azureConfig.deployment.set;
    const localConfigured = useLocalModel ? (!!localModel && !modelError) : true;
    
    const overallStatus = (useLocalModel ? localConfigured : azureConfigured) ? 'ok' : 'misconfigured';
    
    console.log('Health check - Mode:', useLocalModel ? 'local' : 'azure');
    console.log('Health check - Azure config:', JSON.stringify(azureConfig, null, 2));
    console.log('Health check - Local model:', JSON.stringify(localModelStatus, null, 2));
    console.log('Overall status:', overallStatus);
    console.log('=== HEALTH CHECK END ===\n');
    
    res.json({ 
        status: overallStatus,
        timestamp: new Date().toISOString(),
        mode: useLocalModel ? 'local' : 'azure',
        azure: azureConfig,
        localModel: localModelStatus,
        modelInfo: useLocalModel ? {
            model: localModelName,
            type: 'local-transformers',
            supportedFeatures: ['text-generation', 'sentiment-analysis', 'question-answering'],
            memoryUsage: process.memoryUsage()
        } : {
            deployment: deployment,
            type: isO1 ? 'o1-series' : 'gpt-series',
            supportedRoles: isO1 ? ['user', 'assistant'] : ['system', 'user', 'assistant'],
            supportedParameters: isO1 ? 
                ['max_completion_tokens'] : 
                ['max_tokens', 'temperature', 'top_p', 'frequency_penalty', 'presence_penalty']
        },
        environment: {
            nodeVersion: process.version,
            platform: process.platform,
            uptime: process.uptime()
        },
        recommendations: useLocalModel ? 
            (!localModel ? ['Initialize the local model via POST /api/model/initialize'] : []) :
            [
                !azureConfig.endpoint.set && 'Set AZURE_OPENAI_ENDPOINT',
                !azureConfig.apiKey.set && 'Set AZURE_OPENAI_KEY',
                !azureConfig.deployment.set && 'Set AZURE_OPENAI_DEPLOYMENT'
            ].filter(Boolean)
    });
});

// Debug endpoint to test environment variables
app.get('/api/debug/env', (req, res) => {
    console.log('\n=== DEBUG ENV REQUEST ===');
    console.log('All environment variables:');
    
    const envVars = {};
    Object.keys(process.env).forEach(key => {
        if (key.includes('AZURE') || key.includes('OPENAI') || key.includes('LOCAL') || key.includes('USE_LOCAL')) {
            envVars[key] = process.env[key] ? 
                          (key.includes('KEY') ? `${process.env[key].substring(0, 10)}...` : process.env[key]) : 
                          'NOT SET';
        }
    });
    
    console.log('Azure/OpenAI/Local related env vars:', envVars);
    console.log('=== DEBUG ENV END ===\n');
    
    res.json({
        configVars: envVars,
        localModelStatus: {
            pipelineReady: !!pipeline,
            modelLoaded: !!localModel,
            modelLoading: modelLoading,
            modelError: modelError
        },
        totalEnvVars: Object.keys(process.env).length,
        timestamp: new Date().toISOString()
    });
});

// Error troubleshooting helper with o1 model awareness
function getErrorTroubleshooting(status, errorDetails, isO1Model) {
    const troubleshooting = {
        400: isO1Model ? 
             'o1 models have different requirements: no system role, use max_completion_tokens instead of max_tokens' :
             'Check your request parameters - invalid model parameters or message format',
        401: 'Check your AZURE_OPENAI_KEY - it may be invalid or expired',
        403: 'Check your Azure OpenAI resource permissions and subscription status',
        404: 'Check your AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT - they may be incorrect',
        429: 'Rate limit exceeded - wait a moment and try again',
        500: 'Azure OpenAI service error - check Azure service status'
    };
    
    return troubleshooting[status] || 'Check your Azure OpenAI configuration in the Azure Portal';
}

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((error, req, res, next) => {
    console.log('\n!!! GLOBAL ERROR HANDLER !!!');
    console.log('Error:', error);
    console.log('Request URL:', req.url);
    console.log('Request Method:', req.method);
    console.log('=== GLOBAL ERROR END ===\n');
    
    res.status(500).json({
        error: 'Unexpected server error',
        details: error.message,
        timestamp: new Date().toISOString()
    });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log('\n🚀 SERVER STARTING 🚀');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Server running on port: ${port}`);
    console.log(`Health check: http://localhost:${port}/api/health`);
    console.log(`Environment debug: http://localhost:${port}/api/debug/env`);
    console.log(`Model status: http://localhost:${port}/api/model/status`);
    console.log(`Memory usage: http://localhost:${port}/api/system/memory`);
    console.log(`Node version: ${process.version}`);
    console.log(`Platform: ${process.platform}`);
    console.log('========================\n');
});