const OpenAI = require('openai');
const { azureOpenAI } = require('../config/environment');
const { logSuccess, logWarning, logError } = require('../utils/logger');

let azureOpenAIClient = null;

function initializeAzureOpenAI() {
    if (azureOpenAIClient) return azureOpenAIClient;
    
    try {
        const { endpoint, key, deployment, version } = azureOpenAI;
        
        console.log('=== Azure OpenAI Initialization Debug ===');
        console.log('Environment:', process.env.NODE_ENV || 'not set');
        console.log('Azure App Service:', process.env.WEBSITE_SITE_NAME ? 'YES' : 'NO');
        console.log('Endpoint:', endpoint ? endpoint.substring(0, 30) + '...' : 'NOT SET');
        console.log('API Key:', key ? 'SET (length: ' + key.length + ')' : 'NOT SET');
        console.log('Deployment:', deployment || 'NOT SET');
        console.log('Version:', version || 'NOT SET');
        console.log('===========================================');
        
        if (!endpoint || !key || !deployment) {
            const missing = [];
            if (!endpoint) missing.push('AZURE_OPENAI_ENDPOINT');
            if (!key) missing.push('AZURE_OPENAI_KEY');
            if (!deployment) missing.push('AZURE_OPENAI_DEPLOYMENT');
            
            logWarning(`Azure OpenAI configuration incomplete. Missing: ${missing.join(', ')}`);
            return null;
        }
        
        // Validate endpoint format
        if (!endpoint.startsWith('https://')) {
            logError('Invalid endpoint format. Must start with https://');
            return null;
        }
        
        // Create Azure OpenAI client using the OpenAI library
        azureOpenAIClient = new OpenAI({
            apiKey: key,
            baseURL: `${endpoint}/openai/deployments/${deployment}`,
            defaultQuery: { 'api-version': version },
            defaultHeaders: {
                'api-key': key,
            },
        });
        
        logSuccess('Azure OpenAI client initialized successfully');
        return azureOpenAIClient;
        
    } catch (error) {
        logError(`Failed to initialize Azure OpenAI client: ${error.message}`);
        return null;
    }
}

async function generateAzureOpenAIResponse(message, context = '', sources = []) {
    const { endpoint, key, deployment, version } = azureOpenAI;
    
    console.log('=== Azure OpenAI Request Debug ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Environment vars check:');
    console.log('- Endpoint:', endpoint ? 'SET' : 'NOT SET');
    console.log('- API Key:', key ? 'SET' : 'NOT SET');
    console.log('- Deployment:', deployment || 'NOT SET');
    console.log('- Version:', version || 'NOT SET');
    
    if (!endpoint || !key || !deployment) {
        const error = new Error('Azure OpenAI configuration incomplete. Missing: ' + 
            [!endpoint && 'endpoint', !key && 'apiKey', !deployment && 'deployment']
            .filter(Boolean).join(', '));
        logError(`Configuration error: ${error.message}`);
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
            
            response = await azureOpenAIClient.chat.completions.create(requestBody);
        }
        
        console.log('Azure OpenAI response received successfully');
        
        if (response && response.choices && response.choices[0] && response.choices[0].message) {
            let aiResponse = response.choices[0].message.content || "I couldn't generate a response.";
            
            // Add sources if available
            if (sources.length > 0) {
                aiResponse += `\n\n📚 **Sources:**\n${sources.map(s => `• ${s}`).join('\n')}`;
            }
            
            console.log(`✅ Azure OpenAI response generated (${aiResponse.length} characters)`);
            return aiResponse;
        } else {
            logError('Unexpected response structure from Azure OpenAI');
            throw new Error('Invalid response structure from Azure OpenAI');
        }
        
    } catch (error) {
        logError(`Azure OpenAI API error: ${error.message}`);
        
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

module.exports = {
    initializeAzureOpenAI,
    generateAzureOpenAIResponse,
    getAzureOpenAIClient: () => azureOpenAIClient
};