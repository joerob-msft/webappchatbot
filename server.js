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

// Chat API endpoint with comprehensive error handling
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
        const apiVersion = process.env.AZURE_OPENAI_VERSION || '2024-08-01-preview';
        
        console.log('Environment Variables Check:');
        console.log('- AZURE_OPENAI_ENDPOINT:', endpoint ? `${endpoint.substring(0, 20)}...` : 'NOT SET');
        console.log('- AZURE_OPENAI_KEY:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT SET');
        console.log('- AZURE_OPENAI_DEPLOYMENT:', deployment || 'NOT SET');
        console.log('- AZURE_OPENAI_VERSION:', apiVersion);
        
        if (!endpoint) {
            console.log('ERROR: AZURE_OPENAI_ENDPOINT environment variable not set');
            return res.status(500).json({ 
                error: 'Configuration Error: Azure OpenAI endpoint not configured',
                details: 'AZURE_OPENAI_ENDPOINT environment variable is missing',
                configHelp: 'Set AZURE_OPENAI_ENDPOINT to your Azure OpenAI resource URL (e.g., https://your-resource.openai.azure.com)'
            });
        }
        
        if (!apiKey) {
            console.log('ERROR: AZURE_OPENAI_KEY environment variable not set');
            return res.status(500).json({ 
                error: 'Configuration Error: Azure OpenAI API key not configured',
                details: 'AZURE_OPENAI_KEY environment variable is missing',
                configHelp: 'Set AZURE_OPENAI_KEY to your Azure OpenAI API key from the Azure Portal'
            });
        }
        
        if (!deployment) {
            console.log('ERROR: AZURE_OPENAI_DEPLOYMENT environment variable not set');
            return res.status(500).json({ 
                error: 'Configuration Error: Azure OpenAI deployment not configured',
                details: 'AZURE_OPENAI_DEPLOYMENT environment variable is missing',
                configHelp: 'Set AZURE_OPENAI_DEPLOYMENT to your model deployment name (e.g., gpt-4o-mini)'
            });
        }

        // Build and validate Azure OpenAI API URL
        const azureUrl = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
        console.log('Azure OpenAI URL:', azureUrl);

        // Prepare request payload
        const requestPayload = {
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful AI assistant.'
                },
                {
                    role: 'user',
                    content: message
                }
            ],
            max_tokens: 1000,
            temperature: 0.7,
            top_p: 0.95,
            frequency_penalty: 0,
            presence_penalty: 0
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
                troubleshooting: getErrorTroubleshooting(response.status, errorDetails)
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
                timestamp: new Date().toISOString()
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
            set: !!process.env.AZURE_OPENAI_DEPLOYMENT,
            value: process.env.AZURE_OPENAI_DEPLOYMENT || null
        },
        apiVersion: process.env.AZURE_OPENAI_VERSION || '2024-08-01-preview'
    };
    
    const allConfigured = config.endpoint.set && config.apiKey.set && config.deployment.set;
    
    console.log('Health check configuration:', JSON.stringify(config, null, 2));
    console.log('All configured:', allConfigured);
    console.log('=== HEALTH CHECK END ===\n');
    
    res.json({ 
        status: allConfigured ? 'ok' : 'misconfigured',
        timestamp: new Date().toISOString(),
        config: config,
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

// Error troubleshooting helper
function getErrorTroubleshooting(status, errorDetails) {
    const troubleshooting = {
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