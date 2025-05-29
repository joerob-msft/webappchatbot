# Advanced AI Chatbot with RAG, Local Models & Azure OpenAI

A powerful web-based chatbot that supports both Azure OpenAI Service and local AI models, featuring RAG (Retrieval-Augmented Generation), website crawling, document upload, and intelligent content indexing. Built with Node.js and Express.

## 🚀 Features

### Core AI Capabilities
- **Dual Mode Support**: Run local models or use Azure OpenAI Service
- **Local Model Inference**: Server-side AI models using Transformers.js
- **Multi-Model Support**: Works with GPT-3.5, GPT-4, o1-series, and various local models
- **Model-Aware Configuration**: Automatically adjusts parameters based on the selected model

### RAG (Retrieval-Augmented Generation)
- **Document Upload**: Support for .txt, .pdf, .docx, and .md files
- **Website Crawling**: Automatically crawl and index website content
- **Intelligent Chunking**: Smart text segmentation with overlap for better context
- **Semantic Search**: Vector embeddings for relevant document retrieval
- **Source Attribution**: Responses include source references

### Advanced Features
- **Auto Website Indexing**: Automatically crawls your website for content
- **Document Processing**: Extract text from various file formats
- **Content Management**: Manage uploaded documents and crawled content
- **Debug Mode**: Built-in debugging interface for troubleshooting
- **Health Monitoring**: Comprehensive health check and monitoring endpoints
- **Memory Tracking**: Monitor resource usage for local models

### Deployment Ready
- **Azure Deployment**: Configured for Azure Web Apps with GitHub Actions CI/CD
- **Environment Management**: Flexible configuration for different environments
- **Scalable Architecture**: Designed to handle multiple users and documents

## 📋 Prerequisites

### Local Development
- **Node.js**: Version 18.0.0 or higher (required for Transformers.js)
- **npm**: Comes with Node.js
- **Git**: For version control
- **Memory**: At least 2GB RAM for local models (4GB+ recommended for RAG)
- **Storage**: Additional space for uploaded documents and model cache

### Azure Resources (Optional for Cloud Mode)
- **Azure Subscription**: Active Azure subscription
- **Azure OpenAI Service**: Deployed Azure OpenAI resource
- **Model Deployment**: At least one model deployed (GPT-3.5, GPT-4, or o1-series)

## ⚙️ Environment Configuration

### Complete .env Configuration

Create a `.env` file in the project root with these settings:

```env
# =====================================
# LOCAL MODEL CONFIGURATION
# =====================================
USE_LOCAL_MODEL=true
LOCAL_MODEL_NAME=distilgpt2

# =====================================
# RAG CONFIGURATION
# =====================================
RAG_CHUNK_SIZE=500
RAG_CHUNK_OVERLAP=50
RAG_TOP_K=3

# =====================================
# WEBSITE CRAWLING CONFIGURATION
# =====================================
WEBSITE_AUTO_CRAWL=true
WEBSITE_MAX_PAGES=50
WEBSITE_CRAWL_DELAY=1000

# =====================================
# AZURE OPENAI (Fallback Configuration)
# =====================================
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_KEY=your-api-key-here
AZURE_OPENAI_DEPLOYMENT=your-deployment-name
AZURE_OPENAI_VERSION=2024-08-01-preview

# =====================================
# SERVER CONFIGURATION
# =====================================
PORT=3000
NODE_ENV=development
```

### Configuration Options Explained

| Setting | Description | Default | Options |
|---------|-------------|---------|---------|
| `USE_LOCAL_MODEL` | Enable local model mode | `true` | `true`, `false` |
| `LOCAL_MODEL_NAME` | Local model to use | `distilgpt2` | See model list below |
| `RAG_CHUNK_SIZE` | Text chunk size for RAG | `500` | 200-1000 words |
| `RAG_CHUNK_OVERLAP` | Overlap between chunks | `50` | 0-100 words |
| `RAG_TOP_K` | Number of relevant chunks to retrieve | `3` | 1-10 |
| `WEBSITE_AUTO_CRAWL` | Auto-crawl website on startup | `true` | `true`, `false` |
| `WEBSITE_MAX_PAGES` | Maximum pages to crawl | `50` | 1-200 |
| `WEBSITE_CRAWL_DELAY` | Delay between page crawls (ms) | `1000` | 500-5000 |

## 🤖 Supported Local Models

### Recommended Models by Use Case

| Use Case | Primary Model | Alternative | Memory | Best For |
|----------|---------------|-------------|---------|----------|
| **Getting Started** | `distilgpt2` | `gpt2` | ~250MB | Fast setup, testing |
| **General Chat** | `distilgpt2` | `gpt2` | ~250MB | Balanced speed/quality |
| **Better Quality** | `gpt2` | `flan-t5-small` | ~700MB | Higher quality responses |
| **Instructions** | `flan-t5-small` | `gpt2` | ~450MB | Following commands |
| **RAG + Documents** | `distilgpt2` | `gpt2` | ~250MB+ | With document context |
| **Production** | `gpt2` | `flan-t5-small` | ~700MB | Best local quality |

### Available Models with Details

| Model Name | Provider | Task | Download Size | Memory Usage | Quality |
|------------|----------|------|---------------|--------------|---------|
| `distilgpt2` | Hugging Face/OpenAI | Text Generation | ~82MB | ~250MB | ⭐⭐⭐ |
| `gpt2` | OpenAI | Text Generation | ~500MB | ~700MB | ⭐⭐⭐⭐ |
| `flan-t5-small` | Google | Instruction Following | ~300MB | ~450MB | ⭐⭐⭐⭐ |
| `distilbert-sentiment` | Hugging Face | Sentiment + Chat | ~250MB | ~400MB | ⭐⭐⭐ |

### Memory Requirements by Azure Plan

| Azure Plan | Available RAM | Recommended Models | RAG Support |
|------------|---------------|-------------------|-------------|
| **Free F1** | 1GB | `distilgpt2` only | Limited |
| **Basic B1** | 1.75GB | `distilgpt2` | ✅ Good |
| **Standard S1** | 1.75GB | `distilgpt2`, `bert-qa` | ✅ Good |
| **Standard S2** | 3.5GB | `gpt2`, `flan-t5-small` | ✅ Excellent |
| **Premium P1V2+** | 7GB+ | All models | ✅ Full Features |

## 🛠️ Local Development Setup

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/webappchatbot.git
cd webappchatbot
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
Create your `.env` file (see configuration section above).

**Quick Start Configuration:**
```env
# Minimal setup for local development
USE_LOCAL_MODEL=true
LOCAL_MODEL_NAME=distilgpt2
PORT=3000
```

### 4. Start the Application
```bash
npm start
```

### 5. Access the Application
- **Main Chat Interface**: http://localhost:3000
- **Knowledge Base**: http://localhost:3000/dogs-qa.html
- **Health Check**: http://localhost:3000/api/health
- **Model Status**: http://localhost:3000/api/model/status
- **Website Crawl Status**: http://localhost:3000/api/website/status
- **Debug Environment**: http://localhost:3000/api/debug/env

### 6. Initialize RAG (Optional)
The system will automatically:
- Download and initialize the local model on first use
- Initialize the embedder for RAG functionality
- Auto-crawl your website if `WEBSITE_AUTO_CRAWL=true`

## 📚 RAG (Retrieval-Augmented Generation) Features

### Document Upload
Upload documents to enhance the chatbot's knowledge:

```bash
# Upload a document via API
curl -X POST http://localhost:3000/api/upload \
  -F "file=@document.pdf" \
  -F "description=Company policies"
```

**Supported Formats:**
- `.txt` - Plain text files
- `.pdf` - PDF documents
- `.docx` - Microsoft Word documents
- `.md` - Markdown files

### Website Crawling
Automatically crawl and index website content:

```bash
# Crawl a website
curl -X POST http://localhost:3000/api/website/crawl \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://example.com",
    "maxPages": 20,
    "respectRobots": true,
    "crawlDelay": 1000
  }'

# Auto-crawl current website
curl -X POST http://localhost:3000/api/website/auto-crawl
```

### RAG Configuration
Fine-tune RAG behavior:

```bash
# Check RAG status
curl http://localhost:3000/api/health

# View website crawl status
curl http://localhost:3000/api/website/status
```

### How RAG Works
1. **Document Processing**: Uploaded files are parsed and chunked into manageable pieces
2. **Embedding Generation**: Each chunk is converted to vector embeddings
3. **Query Processing**: User questions are embedded using the same model
4. **Similarity Search**: Find the most relevant document chunks
5. **Context Injection**: Relevant content is added to the AI prompt
6. **Response Generation**: AI generates answers based on retrieved context
7. **Source Attribution**: Responses include references to source documents

## 🌐 Website Crawling Features

### Auto-Crawling
When enabled, the system automatically crawls your website to build a knowledge base:

```env
WEBSITE_AUTO_CRAWL=true
WEBSITE_MAX_PAGES=50
WEBSITE_CRAWL_DELAY=1000
```

### Manual Crawling
Trigger crawls manually for external websites:

```javascript
// Example: Crawl a documentation site
fetch('/api/website/crawl', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    baseUrl: 'https://docs.example.com',
    maxPages: 30,
    respectRobots: true,
    includeExternalLinks: false,
    crawlDelay: 1500
  })
});
```

### Crawl Configuration

| Option | Description | Default | Range |
|--------|-------------|---------|-------|
| `maxPages` | Maximum pages to crawl | 50 | 1-200 |
| `respectRobots` | Follow robots.txt rules | true | true/false |
| `includeExternalLinks` | Crawl external domains | false | true/false |
| `crawlDelay` | Delay between requests (ms) | 1000 | 500-5000 |

## 🔧 API Endpoints

### Chat & AI
- `POST /api/chat` - Send message to AI with RAG support
- `POST /api/model/initialize` - Initialize/switch local model
- `GET /api/model/status` - Check model status and configuration

### Document Management
- `POST /api/upload` - Upload documents for RAG
- `GET /api/documents` - List uploaded documents
- `DELETE /api/documents/:id` - Remove document

### Website Crawling
- `POST /api/website/crawl` - Crawl external website
- `POST /api/website/auto-crawl` - Crawl current website
- `GET /api/website/status` - Check crawl status and statistics

### Monitoring & Debug
- `GET /api/health` - Comprehensive health check
- `GET /api/debug/env` - Environment variables (masked)
- `GET /api/system/memory` - Memory usage statistics

## 🚀 Azure Deployment

### Local Model Mode on Azure

Configure these application settings in your Azure Web App:

| Name | Value | Notes |
|------|-------|-------|
| `USE_LOCAL_MODEL` | `true` | Enable local model mode |
| `LOCAL_MODEL_NAME` | `distilgpt2` | Choose based on your plan |
| `RAG_CHUNK_SIZE` | `500` | Optimize for your use case |
| `WEBSITE_AUTO_CRAWL` | `true` | Enable auto-crawling |
| `WEBSITE_MAX_PAGES` | `20` | Limit for Azure plans |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~18` | Required for Transformers.js |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` | Build dependencies |

### Azure OpenAI Mode on Azure

| Name | Value |
|------|-------|
| `USE_LOCAL_MODEL` | `false` |
| `AZURE_OPENAI_ENDPOINT` | `https://your-resource.openai.azure.com/` |
| `AZURE_OPENAI_KEY` | `your-api-key-here` |
| `AZURE_OPENAI_DEPLOYMENT` | `your-deployment-name` |
| `AZURE_OPENAI_VERSION` | `2024-08-01-preview` |

### GitHub Actions Deployment

The included workflow ([.github/workflows/main_joerob-chatbot.yml](.github/workflows/main_joerob-chatbot.yml)) automatically deploys to Azure when you push to the main branch.

## 📝 Usage Examples

### Basic Chat with RAG
```bash
# Send a message that will use RAG if documents are available
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are the best dog breeds for families?",
    "useRAG": true,
    "includeWebsiteContent": true
  }'
```

### Upload and Query Documents
```bash
# Upload a document
curl -X POST http://localhost:3000/api/upload \
  -F "file=@company-handbook.pdf"

# Ask a question about the document
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is our vacation policy?"}'
```

### Model Management
```bash
# Switch to a different model
curl -X POST http://localhost:3000/api/model/initialize \
  -H "Content-Type: application/json" \
  -d '{"modelName": "gpt2"}'

# Check model status
curl http://localhost:3000/api/model/status
```

## 🔍 Troubleshooting

### Common Issues

#### Model Loading Issues
1. **"Model is loading" error**
   - Wait 30-60 seconds for model download and initialization
   - Check model status: `GET /api/model/status`
   - Ensure sufficient memory for the selected model

2. **Memory issues**
   - Use smaller models (`distilgpt2` instead of `gpt2`)
   - Check memory usage: `GET /api/debug/env`
   - Restart application to clear memory

3. **RAG not working**
   - Ensure embedder is initialized: `GET /api/health`
   - Check if documents are uploaded/crawled
   - Verify `useRAG: true` in chat requests

#### Document Upload Issues
4. **File upload fails**
   - Check file size (10MB limit)
   - Ensure file type is supported (.txt, .pdf, .docx, .md)
   - Verify uploads directory exists and is writable

5. **PDF parsing errors**
   - Ensure PDF is not password-protected
   - Try converting to .txt first for testing
   - Check server logs for specific error details

#### Website Crawling Issues
6. **Crawling fails**
   - Check robots.txt compliance (`respectRobots: false` for testing)
   - Verify target website is accessible
   - Reduce `maxPages` for initial testing

7. **No content indexed**
   - Check crawl status: `GET /api/website/status`
   - Ensure pages have substantial content (>100 characters)
   - Verify crawl delay is appropriate for target site

### Performance Optimization

#### Local Models
- Start with `distilgpt2` for fastest performance
- Monitor memory usage regularly
- Consider model switching based on request complexity

#### RAG Performance
- Optimize chunk size based on document types
- Adjust `RAG_TOP_K` based on response quality needs
- Balance crawl frequency with content freshness

#### Azure Deployment
- Choose appropriate Azure plan for selected model
- Enable compression for file uploads
- Use CDN for static assets if needed

## 📊 Monitoring & Analytics

### Health Monitoring
```bash
# Comprehensive health check
curl http://localhost:3000/api/health

# Returns:
{
  "status": "ok",
  "models": {
    "localModel": true,
    "embedder": true
  },
  "rag": {
    "documents": 5,
    "chunks": 150,
    "websitePages": 12
  }
}
```

### Memory Monitoring
```bash
# Check memory usage
curl http://localhost:3000/api/debug/env

# Returns memory statistics and configuration
```

### RAG Statistics
```bash
# Website crawl statistics
curl http://localhost:3000/api/website/status

# Returns crawl progress and indexed content stats
```

## 🗂️ Project Structure

```
webappchatbot/
├── 📁 public/
│   ├── index.html              # Main chat interface with debug panel
│   └── dogs-qa.html            # Example knowledge base page
├── 📁 uploads/                 # Uploaded documents (auto-created)
├── 📁 .github/workflows/
│   └── main_joerob-chatbot.yml # Azure deployment workflow
├── 📄 server.js                # Main server with RAG, crawling, local models
├── 📄 package.json             # Dependencies including transformers
├── 📄 .env                     # Environment configuration (not in git)
├── 📄 .gitignore               # Git ignore rules
├── 📄 web.config               # IIS configuration for Azure
├── 📄 LICENSE                  # MIT license
└── 📄 README.md                # This comprehensive guide
```

## 🔮 Advanced Features

### Hybrid AI Approach
- **Development**: Use local models for fast iteration
- **Production**: Switch to Azure OpenAI for best quality
- **Fallback**: Automatic fallback between local and cloud models

### Content Management
- **Document Versioning**: Track document updates and changes
- **Content Expiration**: Automatic refresh of crawled content
- **Source Prioritization**: Weight different content sources

### Customization Options
- **Model Switching**: Change models without restart
- **RAG Tuning**: Adjust retrieval parameters per use case
- **Custom Crawling**: Specialized crawlers for specific sites

## 🚀 Future Enhancements

### Planned Features
- **Ollama Integration**: Support for larger local models
- **Vector Database**: Persistent storage for embeddings
- **Multi-language Support**: Support for non-English content
- **Streaming Responses**: Real-time response streaming
- **Advanced Analytics**: Usage patterns and performance metrics

### Integration Opportunities
- **Database Integration**: Connect to existing databases
- **API Integrations**: External knowledge sources
- **Authentication**: User management and access control
- **Caching**: Redis for improved performance

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Test with both local and Azure models
4. Test RAG functionality with sample documents
5. Ensure memory usage is reasonable
6. Submit a pull request

### Development Guidelines
- Test with multiple model types
- Verify RAG performance with various document types
- Check memory usage with different configurations
- Ensure backward compatibility
- Add appropriate error handling

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Getting Help

1. **Quick Start Issues**: Follow the troubleshooting guide above
2. **Model Selection**: Use the model recommendation table
3. **RAG Problems**: Check health endpoints for system status
4. **Performance Issues**: Monitor memory usage and optimize configuration
5. **Deployment Issues**: Verify Azure configuration settings

### Useful Debug Commands

```bash
# Complete system health check
curl http://localhost:3000/api/health

# Model status and memory usage
curl http://localhost:3000/api/model/status

# RAG and crawling status
curl http://localhost:3000/api/website/status

# Environment configuration
curl http://localhost:3000/api/debug/env

# Test model switching
curl -X POST http://localhost:3000/api/model/initialize \
  -H "Content-Type: application/json" \
  -d '{"modelName": "distilgpt2"}'
```

### Community & Issues

- **GitHub Issues**: Report bugs and request features
- **Discussions**: Share tips and use cases
- **Documentation**: Contribute to improve this guide

---

## 🎯 Quick Start Recommendations

- **New Users**: Start with `distilgpt2` and auto-crawl enabled
- **Better Quality**: Upgrade to `gpt2` when ready
- **Production**: Consider Azure OpenAI for best results
- **Limited Memory**: Stick with `distilgpt2` and optimize RAG settings
- **Development**: Use local models for fast iteration
- **Enterprise**: Combine local models with Azure OpenAI fallback

This comprehensive chatbot solution provides enterprise-grade AI capabilities with the flexibility to run entirely local or leverage cloud services as needed.