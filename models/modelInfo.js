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

function getLocalModelInfo(modelName) {
    return modelConfig[modelName] || {
        task: 'text-generation',
        size: 'unknown',
        description: 'Unknown model',
        memoryUsage: 'Unknown'
    };
}

module.exports = { getLocalModelInfo, modelConfig };