const express = require('express');
const path = require('path');
const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Enhanced logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

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

// Chat API endpoint with model-aware handling
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
                usage: data.usage
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

// Enhanced health check endpoint
app.get('/api/health', (req, res) => {
    console.log('\n=== HEALTH CHECK REQUEST ===');
    
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
    const isO1 = isO1Model(deployment);
    const apiVersion = getApiVersion(deployment);
    
    const config = {
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
    
    const allConfigured = config.endpoint.set && config.apiKey.set && config.deployment.set;
    
    console.log('Health check configuration:', JSON.stringify(config, null, 2));
    console.log('All configured:', allConfigured);
    console.log('=== HEALTH CHECK END ===\n');
    
    res.json({ 
        status: allConfigured ? 'ok' : 'misconfigured',
        timestamp: new Date().toISOString(),
        config: config,
        modelInfo: {
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
        missingConfig: [
            !config.endpoint.set && 'AZURE_OPENAI_ENDPOINT',
            !config.apiKey.set && 'AZURE_OPENAI_KEY',
            !config.deployment.set && 'AZURE_OPENAI_DEPLOYMENT'
        ].filter(Boolean)
    });
});

// Debug endpoint to test environment variables
app.get('/api/debug/env', (req, res) => {
    console.log('\n=== DEBUG ENV REQUEST ===');
    console.log('All environment variables:');
    
    const envVars = {};
    Object.keys(process.env).forEach(key => {
        if (key.includes('AZURE') || key.includes('OPENAI')) {
            envVars[key] = process.env[key] ? 
                          `${process.env[key].substring(0, 10)}...` : 
                          'NOT SET';
        }
    });
    
    console.log('Azure/OpenAI related env vars:', envVars);
    console.log('=== DEBUG ENV END ===\n');
    
    res.json({
        azureOpenAIVars: envVars,
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
    console.log(`Node version: ${process.version}`);
    console.log(`Platform: ${process.platform}`);
    console.log('========================\n');
});