const { isAzureAppService } = require('../config/environment');
const { getLocalModelInfo } = require('./modelInfo');
const { logSuccess, logWarning, logError } = require('../utils/logger');

// State variables
let pipeline = null;
let localModel = null;
let modelLoading = false;
let modelError = null;
let transformersAvailable = false;

async function conditionallyLoadTransformers() {
    // Skip transformers entirely in Azure App Service
    if (isAzureAppService) {
        logWarning('Azure App Service detected - skipping Transformers.js import');
        return false;
    }
    
    try {
        console.log('📦 Attempting to load Transformers.js...');
        const transformers = await import('@xenova/transformers');
        pipeline = transformers.pipeline;
        transformersAvailable = true;
        logSuccess('Transformers.js loaded successfully');
        return true;
    } catch (error) {
        logWarning(`Transformers.js not available: ${error.message}`);
        return false;
    }
}

async function initializeLocalModel(modelName = 'Xenova/LaMini-Flan-T5-248M') {
    // Skip local models entirely in Azure App Service
    if (isAzureAppService) {
        logWarning('Azure App Service detected - local models not supported');
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
            logSuccess(`Successfully loaded model: ${fallbackModel}`);
            
            // Update the environment variable to remember successful model
            process.env.LOCAL_MODEL_NAME = fallbackModel;
            
            return true;
            
        } catch (error) {
            console.log(`❌ Failed to load ${fallbackModel}: ${error.message}`);
            
            if (fallbackModel === fallbackModels[fallbackModels.length - 1]) {
                // This was the last fallback option
                modelLoading = false;
                modelError = `All model loading attempts failed. Last error: ${error.message}`;
                logError('All fallback models failed');
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
        logError(`Error generating response with context: ${error.message}`);
        throw error;
    }
}

module.exports = {
    conditionallyLoadTransformers,
    initializeLocalModel,
    generateResponseWithContext,
    getLocalModel: () => localModel,
    getModelLoading: () => modelLoading,
    getModelError: () => modelError,
    getTransformersAvailable: () => transformersAvailable
};