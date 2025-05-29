const isAzureAppService = !!process.env.WEBSITE_SITE_NAME;
const useLocalModel = process.env.USE_LOCAL_MODEL === 'true';

module.exports = {
    // Environment detection
    isAzureAppService,
    useLocalModel,
    
    // Model configuration
    localModelName: process.env.LOCAL_MODEL_NAME || 'Xenova/LaMini-Flan-T5-248M',
    
    // RAG Configuration
    ragChunkSize: parseInt(process.env.RAG_CHUNK_SIZE) || 500,
    ragChunkOverlap: parseInt(process.env.RAG_CHUNK_OVERLAP) || 50,
    ragTopK: parseInt(process.env.RAG_TOP_K) || 3,
    
    // Website Crawling
    websiteAutoCrawl: process.env.WEBSITE_AUTO_CRAWL === 'true',
    websiteMaxPages: parseInt(process.env.WEBSITE_MAX_PAGES) || 50,
    websiteCrawlDelay: parseInt(process.env.WEBSITE_CRAWL_DELAY) || 1000,
    
    // Azure OpenAI
    azureOpenAI: {
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        key: process.env.AZURE_OPENAI_KEY,
        deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
        version: process.env.AZURE_OPENAI_VERSION || '2024-08-01-preview'
    },
    
    // Server configuration
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development'
};