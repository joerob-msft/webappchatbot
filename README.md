# Advanced AI Chatbot with RAG, Local Models & Azure OpenAI

A powerful web-based chatbot that supports both Azure OpenAI Service and local AI models, featuring RAG (Retrieval-Augmented Generation), website crawling, document upload, and intelligent content indexing. Built with Node.js and Express.

## 🚀 Features

### Core AI Capabilities
- **Hybrid Model Support**: Run local models (Transformers.js) or use Azure OpenAI Service
- **Local Model Inference**: Server-side AI models with automatic fallback system
- **Multi-Model Support**: Works with GPT-3.5, GPT-4, o1-series, and various local models
- **Model-Aware Configuration**: Automatically adjusts parameters based on the selected model
- **Intelligent Fallback**: Automatic model switching when preferred models fail

### RAG (Retrieval-Augmented Generation)
- **Document Upload**: Support for .txt, .pdf, .docx, and .md files (10MB limit)
- **Website Crawling**: Automatically crawl and index website content with robots.txt compliance
- **Intelligent Chunking**: Smart text segmentation with configurable overlap for better context
- **Semantic Search**: Vector embeddings using `all-MiniLM-L6-v2` for relevant document retrieval
- **Source Attribution**: Responses include source references with URLs
- **Auto-Crawling**: Automatically crawls your website for knowledge base building

### Advanced Features
- **Admin Panel**: Comprehensive web-based administration interface
- **Real-time Status**: Live monitoring of crawl progress, model status, and system health
- **Content Management**: Manage uploaded documents and crawled content
- **Debug Mode**: Built-in debugging interface for troubleshooting
- **Health Monitoring**: Comprehensive health check and monitoring endpoints
- **Memory Tracking**: Monitor resource usage for local models
- **Model Testing**: Built-in model availability testing

### Deployment Ready
- **Azure Deployment**: Configured for Azure Web Apps with GitHub Actions CI/CD
- **Environment Management**: Flexible configuration for different environments
- **Scalable Architecture**: Designed to handle multiple users and documents
- **IIS Support**: Web.config included for Windows/IIS deployment

## 📋 Prerequisites

### Local Development
- **Node.js**: Version 18.0.0 or higher (required for Transformers.js)
- **npm**: Package manager (comes with Node.js)
- **Git**: For version control
- **Memory**: At least 2GB RAM for local models (4GB+ recommended for RAG)
- **Storage**: Additional space for uploaded documents and model cache (~1-2GB)

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
LOCAL_MODEL_NAME=Xenova/LaMini-Flan-T5-248M

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
| `LOCAL_MODEL_NAME` | Local model to use | `Xenova/LaMini-Flan-T5-248M` | See model list below |
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
| **Getting Started** | `Xenova/distilgpt2` | `Xenova/gpt2` | ~250MB | Fast setup, testing |
| **General Chat** | `Xenova/LaMini-Flan-T5-248M` | `Xenova/distilgpt2` | ~300MB | Balanced speed/quality |
| **Better Quality** | `Xenova/gpt2` | `Xenova/flan-t5-small` | ~700MB | Higher quality responses |
| **Instructions** | `Xenova/flan-t5-small` | `Xenova/LaMini-Flan-T5-248M` | ~450MB | Following commands |
| **RAG + Documents** | `Xenova/LaMini-Flan-T5-248M` | `Xenova/distilgpt2` | ~300MB+ | With document context |
| **Production** | `Xenova/gpt2` | `Xenova/flan-t5-small` | ~700MB | Best local quality |

### Available Models with Details

| Model Name | Provider | Task | Download Size | Memory Usage | Quality |
|------------|----------|------|---------------|--------------|---------|
| `Xenova/distilgpt2` | Hugging Face/OpenAI | Text Generation | ~82MB | ~250MB | ⭐⭐⭐ |
| `Xenova/gpt2` | OpenAI | Text Generation | ~500MB | ~700MB | ⭐⭐⭐⭐ |
| `Xenova/LaMini-Flan-T5-248M` | LaMini | Text2Text Generation | ~248MB | ~300MB | ⭐⭐⭐⭐ |
| `Xenova/flan-t5-small` | Google | Instruction Following | ~300MB | ~450MB | ⭐⭐⭐⭐ |
| `Xenova/distilbert-base-uncased-finetuned-sst-2-english` | Hugging Face | Sentiment + Chat | ~250MB | ~400MB | ⭐⭐⭐ |
| `Xenova/distilbert-base-cased-distilled-squad` | Hugging Face | Question Answering | ~250MB | ~400MB | ⭐⭐⭐⭐ |

### Memory Requirements by Azure Plan

| Azure Plan | Available RAM | Recommended Models | RAG Support |
|------------|---------------|-------------------|-------------|
| **Free F1** | 1GB | `Xenova/distilgpt2` only | Limited |
| **Basic B1** | 1.75GB | `Xenova/distilgpt2`, `Xenova/LaMini-Flan-T5-248M` | ✅ Good |
| **Standard S1** | 1.75GB | `Xenova/LaMini-Flan-T5-248M`, `Xenova/distilgpt2` | ✅ Good |
| **Standard S2** | 3.5GB | `Xenova/gpt2`, `Xenova/flan-t5-small` | ✅ Excellent |
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
LOCAL_MODEL_NAME=Xenova/LaMini-Flan-T5-248M
WEBSITE_AUTO_CRAWL=true
PORT=3000
```

### 4. Create Required Directories
```bash
mkdir uploads
```

### 5. Start the Application
```bash
npm start
```

### 6. Access the Application
- **Main Chat Interface**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin.html
- **Knowledge Base**: http://localhost:3000/dogs-qa.html
- **Health Check**: http://localhost:3000/api/debug/health
- **Model Status**: http://localhost:3000/api/model/status
- **Website Crawl Status**: http://localhost:3000/api/website/status
- **Debug Environment**: http://localhost:3000/api/debug/env

### 7. Initialize System (Automatic)
The system will automatically:
- Download and initialize the local model on first use
- Initialize the embedder for RAG functionality
- Auto-crawl your website if `WEBSITE_AUTO_CRAWL=true`
- Create the uploads directory for document storage

## 📚 RAG (Retrieval-Augmented Generation) Features

### Document Upload
Upload documents to enhance the chatbot's knowledge:

**Supported Formats:**
- `.txt` - Plain text files
- `.pdf` - PDF documents (parsed with pdf-parse)
- `.docx` - Microsoft Word documents (parsed with mammoth)
- `.md` - Markdown files

**File Limits:**
- Maximum file size: 10MB
- Automatic text extraction and chunking
- Vector embedding generation for semantic search

### Website Crawling
Automatically crawl and index website content:

```bash
# Manual crawl via API
curl -X POST http://localhost:3000/api/website/crawl \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://example.com",
    "maxPages": 20,
    "respectRobots": true,
    "crawlDelay": 1000
  }'

# Auto-crawl current website
curl http://localhost:3000/api/website/auto-crawl
```

### Crawling Features
- **Robots.txt Compliance**: Automatically respects robots.txt rules
- **Smart Content Extraction**: Uses Cheerio to extract meaningful content
- **Link Discovery**: Automatically finds and follows internal links
- **Error Handling**: Robust error handling with detailed logging
- **Progress Tracking**: Real-time crawl progress monitoring

### RAG Configuration
Fine-tune RAG behavior through environment variables or admin panel:

```bash
# Check RAG status
curl http://localhost:3000/api/debug/health

# View website crawl status
curl http://localhost:3000/api/website/status
```

### How RAG Works
1. **Document Processing**: Uploaded files are parsed and chunked into manageable pieces
2. **Embedding Generation**: Each chunk is converted to vector embeddings using `all-MiniLM-L6-v2`
3. **Query Processing**: User questions are embedded using the same model
4. **Similarity Search**: Find the most relevant document chunks using cosine similarity
5. **Context Injection**: Relevant content is added to the AI prompt with source attribution
6. **Response Generation**: AI generates answers based on retrieved context
7. **Source Attribution**: Responses include references to source documents with URLs

## 🌐 Website Crawling Features

### Auto-Crawling
When enabled, the system automatically crawls your website to build a knowledge base:

```env
WEBSITE_AUTO_CRAWL=true
WEBSITE_MAX_PAGES=50
WEBSITE_CRAWL_DELAY=1000
```

### Manual Crawling via Admin Panel
Use the comprehensive admin panel at `/admin.html` for:
- **Custom Website Crawling**: Enter any URL to crawl external sites
- **Real-time Progress**: Monitor crawl progress and statistics
- **Error Tracking**: View crawl errors and troubleshooting information
- **Content Management**: View indexed content and statistics

### Crawl Configuration

| Option | Description | Default | Range |
|--------|-------------|---------|-------|
| `maxPages` | Maximum pages to crawl | 50 | 1-200 |
| `respectRobots` | Follow robots.txt rules | true | true/false |
| `includeExternalLinks` | Crawl external domains | false | true/false |
| `crawlDelay` | Delay between requests (ms) | 1000 | 500-5000 |
| `userAgent` | Crawler user agent | WebAppChatbot/1.0 | Custom string |

### Content Extraction
- **Smart Selectors**: Prioritizes main content areas
- **Metadata Extraction**: Captures titles, descriptions, and headings
- **Content Filtering**: Removes navigation, ads, and boilerplate content
- **Duplicate Detection**: Prevents indexing of duplicate content

## 🔧 API Endpoints

### Chat & AI
- `POST /api/chat` - Send message to AI with RAG support
- `POST /api/model/initialize` - Initialize/switch local model
- `GET /api/model/status` - Check model status and configuration
- `POST /api/model/test-download` - Test model availability

### Document Management
- `POST /api/upload` - Upload documents for RAG (configured but not shown in current code)
- `GET /api/documents` - List uploaded documents (configured but not shown in current code)
- `DELETE /api/documents/:id` - Remove document (configured but not shown in current code)

### Website Crawling
- `POST /api/website/crawl` - Crawl external website
- `GET /api/website/auto-crawl` - Auto-crawl current website (browser-friendly)
- `POST /api/website/auto-crawl` - Auto-crawl current website (API)
- `GET /api/website/status` - Check crawl status and statistics

### Monitoring & Debug
- `GET /api/debug/health` - Comprehensive health check
- `GET /api/debug/env` - Environment variables (masked)
- `GET /api/system/memory` - Memory usage statistics (via debug/env)

## 🖥️ Admin Panel Features

Access the full-featured admin panel at `/admin.html`:

### Website Crawling Management
- **Quick Actions**: Start auto-crawl, check status, health checks
- **Custom Crawl**: Configure and start custom website crawls
- **Real-time Status**: Live updates on crawl progress and statistics
- **Error Monitoring**: View and troubleshoot crawl errors

### Model Management
- **Model Switching**: Change local models without restart
- **Status Monitoring**: Real-time model status and memory usage
- **Model Testing**: Test model availability and downloads
- **Performance Metrics**: Monitor inference speed and resource usage

### System Monitoring
- **Health Dashboard**: Comprehensive system health overview
- **Memory Tracking**: Real-time memory usage monitoring
- **Configuration View**: Environment and configuration status
- **Debug Tools**: Direct access to debug endpoints

### Test Interface
- **Chat Testing**: Test chat functionality with different configurations
- **RAG Testing**: Test RAG with/without website content
- **Response Analysis**: View response metadata and performance metrics

## 🚀 Azure Deployment

### Local Model Mode on Azure

Configure these application settings in your Azure Web App:

| Name | Value | Notes |
|------|-------|-------|
| `USE_LOCAL_MODEL` | `true` | Enable local model mode |
| `LOCAL_MODEL_NAME` | `Xenova/LaMini-Flan-T5-248M` | Choose based on your plan |
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

### Model Management
```bash
# Switch to a different model
curl -X POST http://localhost:3000/api/model/initialize \
  -H "Content-Type: application/json" \
  -d '{"modelName": "Xenova/gpt2"}'

# Check model status
curl http://localhost:3000/api/model/status

# Test model download
curl -X POST http://localhost:3000/api/model/test-download \
  -H "Content-Type: application/json" \
  -d '{"modelName": "Xenova/distilgpt2"}'
```

### Website Crawling
```bash
# Crawl external website
curl -X POST http://localhost:3000/api/website/crawl \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://docs.example.com",
    "maxPages": 20,
    "respectRobots": true,
    "crawlDelay": 1000
  }'

# Check crawl status
curl http://localhost:3000/api/website/status
```

## 🔍 Troubleshooting

### Common Issues

#### Model Loading Issues
1. **"Model is loading" error**
   - Wait 30-60 seconds for model download and initialization
   - Check model status: `GET /api/model/status`
   - Ensure sufficient memory for the selected model

2. **Memory issues**
   - Use smaller models (`Xenova/distilgpt2` instead of `Xenova/gpt2`)
   - Check memory usage: `GET /api/debug/env`
   - Restart application to clear memory

3. **RAG not working**
   - Ensure embedder is initialized: `GET /api/debug/health`
   - Check if documents are uploaded/crawled
   - Verify `useRAG: true` in chat requests

#### Website Crawling Issues
4. **Crawling fails**
   - Check robots.txt compliance (`respectRobots: false` for testing)
   - Verify target website is accessible
   - Reduce `maxPages` for initial testing
   - Use admin panel for real-time error monitoring

5. **No content indexed**
   - Check crawl status: `GET /api/website/status`
   - Ensure pages have substantial content (>100 characters)
   - Verify crawl delay is appropriate for target site

#### Admin Panel Issues
6. **Admin panel not accessible**
   - Ensure server is running on correct port
   - Check that `/admin.html` file exists in public directory
   - Verify no firewall blocking access

### Performance Optimization

#### Local Models
- Start with `Xenova/LaMini-Flan-T5-248M` for best balance
- Monitor memory usage regularly through admin panel
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
curl http://localhost:3000/api/debug/health

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
│   ├── admin.html              # Comprehensive admin panel
│   └── dogs-qa.html            # Example knowledge base page
├── 📁 uploads/                 # Uploaded documents (auto-created)
├── 📁 .github/workflows/
│   └── main_joerob-chatbot.yml # Azure deployment workflow
├── 📄 server.js                # Main server with RAG, crawling, local models
├── 📄 test-models.js           # Model testing utility
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
- **Model Testing**: Built-in utilities for testing model availability

### Content Management
- **Document Versioning**: Track document updates and changes
- **Content Expiration**: Automatic refresh of crawled content
- **Source Prioritization**: Weight different content sources
- **Real-time Analytics**: Live monitoring through admin panel

### Customization Options
- **Model Switching**: Change models without restart through admin panel
- **RAG Tuning**: Adjust retrieval parameters per use case
- **Custom Crawling**: Specialized crawlers for specific sites
- **Debug Interface**: Comprehensive debugging and monitoring tools

## 🚀 Development Tools

### Model Testing
Use the included `test-models.js` utility to test model availability:

```bash
node test-models.js
```

This will test all configured models and report their availability and download status.

### Admin Interface
The admin panel provides:
- **Real-time Monitoring**: Live updates on system status
- **Interactive Testing**: Test all functionality through the web interface
- **Error Diagnostics**: Detailed error reporting and troubleshooting
- **Performance Monitoring**: Resource usage and response time tracking

### Debug Endpoints
- `/api/debug/health` - Comprehensive system health
- `/api/debug/env` - Environment and memory information
- `/api/model/status` - Model status and configuration
- `/api/website/status` - Crawling status and statistics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Test with both local and Azure models
4. Test RAG functionality with sample documents
5. Ensure memory usage is reasonable
6. Test admin panel functionality
7. Submit a pull request

### Development Guidelines
- Test with multiple model types using the admin panel
- Verify RAG performance with various document types
- Check memory usage with different configurations
- Ensure admin panel functionality works correctly
- Add appropriate error handling and logging
- Update documentation for new features

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Getting Help

1. **Quick Start Issues**: Use the admin panel for real-time diagnostics
2. **Model Selection**: Use the model recommendation table and admin panel testing
3. **RAG Problems**: Check health endpoints and admin panel status
4. **Performance Issues**: Monitor memory usage through admin panel
5. **Deployment Issues**: Verify Azure configuration settings

### Useful Debug Commands

```bash
# Complete system health check
curl http://localhost:3000/api/debug/health

# Model status and memory usage
curl http://localhost:3000/api/model/status

# RAG and crawling status
curl http://localhost:3000/api/website/status

# Environment configuration
curl http://localhost:3000/api/debug/env

# Test model switching
curl -X POST http://localhost:3000/api/model/initialize \
  -H "Content-Type: application/json" \
  -d '{"modelName": "Xenova/distilgpt2"}'
```

### Admin Panel Features
- **Real-time Status**: Live system monitoring
- **Interactive Testing**: Test all functionality through the web interface
- **Error Diagnostics**: Detailed error reporting and troubleshooting
- **Performance Monitoring**: Resource usage and response time tracking

---

## 🎯 Quick Start Recommendations

- **New Users**: Start with `Xenova/LaMini-Flan-T5-248M` and use the admin panel
- **Better Quality**: Upgrade to `Xenova/gpt2` when ready
- **Production**: Consider Azure OpenAI for best results
- **Limited Memory**: Stick with `Xenova/distilgpt2` and optimize RAG settings
- **Development**: Use local models with the admin panel for fast iteration
- **Enterprise**: Combine local models with Azure OpenAI fallback

This comprehensive chatbot solution provides enterprise-grade AI capabilities with an intuitive admin interface and the flexibility to run entirely local or leverage cloud services as needed.