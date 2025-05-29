# Azure OpenAI Web App Chatbot with Local Model Support

A flexible web-based chatbot that supports both Azure OpenAI Service and local AI models, built with Node.js and Express. This application can run entirely locally using Transformers.js or connect to Azure OpenAI for cloud-based inference.

## Features

- **Dual Mode Support**: Run local models or use Azure OpenAI Service
- **Local Model Inference**: Server-side AI models using Transformers.js
- **Multi-Model Support**: Works with GPT-3.5, GPT-4, o1-series, and various local models
- **Model-Aware Configuration**: Automatically adjusts parameters based on the selected model
- **Debug Mode**: Built-in debugging interface for troubleshooting
- **Azure Deployment Ready**: Configured for Azure Web Apps with GitHub Actions CI/CD
- **Health Monitoring**: Health check endpoints for monitoring application status
- **Memory Monitoring**: Track resource usage for local models

## Prerequisites

### Local Development
- **Node.js**: Version 18.0.0 or higher (required for Transformers.js)
- **npm**: Comes with Node.js
- **Git**: For version control
- **Memory**: At least 2GB RAM for local models (4GB+ recommended)

### Azure Resources (Optional for Cloud Mode)
- **Azure Subscription**: Active Azure subscription
- **Azure OpenAI Service**: Deployed Azure OpenAI resource
- **Model Deployment**: At least one model deployed (GPT-3.5, GPT-4, or o1-series)

## Environment Variables

### For Local Model Mode

Create a `.env` file in the project root:

```env
# Local Model Configuration
USE_LOCAL_MODEL=true
LOCAL_MODEL_NAME=distilgpt2

# Azure OpenAI (kept for fallback when USE_LOCAL_MODEL=false)
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_KEY=your-api-key-here
AZURE_OPENAI_DEPLOYMENT=your-deployment-name
AZURE_OPENAI_VERSION=2024-08-01-preview

# Server Configuration (optional)
PORT=3000
NODE_ENV=development
```

### For Azure OpenAI Mode

```env
# Azure OpenAI Configuration
USE_LOCAL_MODEL=false
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_KEY=your-api-key-here
AZURE_OPENAI_DEPLOYMENT=your-deployment-name
AZURE_OPENAI_VERSION=2024-08-01-preview
PORT=3000
```

## Local Model Support

### Available Local Models (Transformers.js)

| Model Name | Provider | Task | Size | Memory Usage | Best For |
|------------|----------|------|------|--------------|----------|
| `distilgpt2` | Hugging Face | Text Generation | ~82MB | ~250MB RAM | **Recommended**: Fast responses, testing |
| `gpt2` | OpenAI/Hugging Face | Text Generation | ~500MB | ~700MB RAM | Better quality responses |
| `distilbert-sentiment` | Hugging Face | Sentiment Analysis | ~250MB | ~400MB RAM | Sentiment + conversation |
| `bert-qa` | Google/Hugging Face | Question Answering | ~250MB | ~400MB RAM | Specific Q&A scenarios |
| `flan-t5-small` | Google | Instruction Following | ~300MB | ~450MB RAM | Following instructions |

### Model Recommendations by Use Case

| Use Case | Recommended Model | Alternative | Why | Notes |
|----------|-------------------|-------------|-----|-------|
| **Getting Started** | `distilgpt2` | `gpt2` | Fastest setup, lowest memory | Best for first-time users |
| **General Conversation** | `distilgpt2` | `gpt2` | Good balance of speed/quality | Most reliable for chat |
| **Better Quality Chat** | `gpt2` | `flan-t5-small` | Higher quality responses | Requires more memory |
| **Instruction Following** | `flan-t5-small` | `gpt2` | Better at following commands | Good for specific tasks |
| **Sentiment Analysis** | `distilbert-sentiment` | `distilgpt2` | Analyzes emotions + responds | Specialized use case |
| **Question Answering** | `distilgpt2` | `flan-t5-small` | **Note: bert-qa has limitations** | Use text generation instead |
| **Development/Testing** | `distilgpt2` | Any | Fast loading, low resource usage | Quickest iteration |
| **Production (Local)** | `gpt2` | `flan-t5-small` | Best quality for local models | Most reliable |

### Important Notes for Q&A Models

⚠️ **bert-qa Model Limitations**: The `bert-qa` model is designed for extractive question answering with specific contexts. It works best when:
- Asking direct, factual questions
- The answer exists within the provided context
- Questions are well-formed and specific

For general conversation, use `distilgpt2` or `gpt2` instead.

### Memory and Performance Guidelines

| Azure Plan | RAM Available | Recommended Models | Performance |
|------------|---------------|-------------------|-------------|
| **Free F1** | 1GB | `distilgpt2` only | Limited, testing only |
| **Basic B1** | 1.75GB | `distilgpt2`, `bert-qa` | Good for development |
| **Standard S1** | 1.75GB | `distilgpt2`, `distilbert-sentiment` | Production ready |
| **Standard S2** | 3.5GB | `gpt2`, `flan-t5-small` | Better quality |
| **Premium P1V2** | 7GB | Any model | Best performance |
| **Premium P2V2+** | 14GB+ | Multiple models | Can run several models |

### Local Model Features

- **Server-side inference**: Models run on your web server, not in the browser
- **No external API calls**: Complete privacy and offline capability
- **Automatic model downloading**: Models are downloaded on first use
- **Fallback support**: Automatically falls back to Azure OpenAI if local models fail
- **Memory monitoring**: Built-in endpoints to monitor resource usage

## Open Source Models from Major Providers

### Currently Supported via Transformers.js

| Provider | Models Available | Examples |
|----------|------------------|----------|
| **OpenAI** | GPT-2 family | `gpt2`, `distilgpt2` |
| **Google** | T5, BERT family | `flan-t5-small`, `bert-qa`, `distilbert-*` |
| **Meta/Facebook** | BART, DeBERTa | `facebook/bart-large-cnn` |
| **Microsoft** | DialoGPT, DeBERTa | `microsoft/DialoGPT-small` |
| **Hugging Face** | Various optimized | `distilbert-*`, `distilgpt2` |

### Additional Models You Can Try

#### Text Generation Models
```env
# Microsoft DialoGPT (conversational)
LOCAL_MODEL_NAME=microsoft/DialoGPT-small

# Google T5 (instruction following)
LOCAL_MODEL_NAME=google/flan-t5-base

# Facebook BART (summarization + generation)
LOCAL_MODEL_NAME=facebook/bart-large
```

#### Specialized Models
```env
# Sentiment Analysis
LOCAL_MODEL_NAME=cardiffnlp/twitter-roberta-base-sentiment-latest

# Question Answering
LOCAL_MODEL_NAME=deepset/roberta-base-squad2

# Summarization
LOCAL_MODEL_NAME=facebook/bart-large-cnn

# Code Generation
LOCAL_MODEL_NAME=microsoft/CodeBERT-base
```

### Limitations and Future Support

**Current Limitations:**
- **Large Models**: Llama 2/3, Claude, GPT-3.5+ are too large for Transformers.js in web apps
- **Newer Models**: Many newer models require GPU acceleration or specialized runtimes
- **Memory Constraints**: Azure Web Apps limit model size to ~1-2GB effectively

**Alternative Approaches for Larger Models:**
1. **Ollama Integration** (for local development):
   ```env
   # Set up Ollama locally, then use:
   USE_OLLAMA=true
   OLLAMA_MODEL=llama2
   OLLAMA_ENDPOINT=http://localhost:11434
   ```

2. **External Model APIs**:
   - Hugging Face Inference API
   - Replicate API
   - Together AI
   - Groq API

3. **Quantized Models** (smaller versions):
   - GGML/GGUF format models
   - 4-bit/8-bit quantized versions

## Local Development Setup

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

#### Option A: Local Models (Recommended for Development)
Create a `.env` file:
```env
USE_LOCAL_MODEL=true
LOCAL_MODEL_NAME=distilgpt2
PORT=3000
```

#### Option B: Azure OpenAI
Create a `.env` file:
```env
USE_LOCAL_MODEL=false
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_KEY=your-api-key-here
AZURE_OPENAI_DEPLOYMENT=your-deployment-name
```

### 4. Start the Application
```bash
npm start
```

### 5. Initialize Local Model (if using local mode)
The model will automatically initialize on first chat, or you can manually initialize:

```bash
# Using curl
curl -X POST http://localhost:3000/api/model/initialize

# Or visit the health check page and use the initialize button
```

### 6. Access the Application
- **Main Interface**: http://localhost:3000
- **Health Check**: http://localhost:3000/api/health
- **Model Status**: http://localhost:3000/api/model/status
- **Memory Usage**: http://localhost:3000/api/system/memory
- **Debug Info**: http://localhost:3000/api/debug/env

## Model Selection Guide

### For Beginners
1. **Start with**: `distilgpt2`
2. **Why**: Fastest download, lowest memory, good for testing
3. **Upgrade to**: `gpt2` when you need better quality

### For Development
1. **Use**: `distilgpt2` or `flan-t5-small`
2. **Why**: Fast iteration, good for testing features
3. **Test with**: Multiple models to ensure compatibility

### For Production
1. **Local**: `gpt2` or `flan-t5-small` (if sufficient memory)
2. **Cloud**: Azure OpenAI for best quality
3. **Hybrid**: Local for development, Azure for production

### For Specific Tasks
1. **General Chat**: `distilgpt2` → `gpt2`
2. **Instructions**: `flan-t5-small`
3. **Q&A**: `bert-qa` (with proper context)
4. **Sentiment**: `distilbert-sentiment`
5. **Code**: Consider external APIs for better code models

## Azure Web App Deployment

### For Local Models on Azure

Configure these application settings in Azure Web App:

| Name | Value | Notes |
|------|-------|-------|
| `USE_LOCAL_MODEL` | `true` | Enable local model mode |
| `LOCAL_MODEL_NAME` | `distilgpt2` | Choose appropriate model for your plan |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~18` | Required for Transformers.js |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` | Ensure dependencies are installed |

### Azure Plan Recommendations

| Azure Plan | Recommended Model | Memory | Performance |
|------------|-------------------|---------|-------------|
| **Basic B1** | `distilgpt2` | 1.75GB | Good for testing |
| **Standard S1** | `distilgpt2`, `bert-qa` | 1.75GB | Production ready |
| **Standard S2** | `gpt2`, `flan-t5-small` | 3.5GB | Better quality |
| **Premium P1V2+** | Any model | 7GB+ | Best performance |

### For Azure OpenAI on Azure

| Name | Value |
|------|-------|
| `USE_LOCAL_MODEL` | `false` |
| `AZURE_OPENAI_ENDPOINT` | `https://your-resource.openai.azure.com/` |
| `AZURE_OPENAI_KEY` | `your-api-key-here` |
| `AZURE_OPENAI_DEPLOYMENT` | `your-deployment-name` |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~18` |

## Supported Models

### Local Models (Transformers.js)
- **distilgpt2**: Fast, lightweight text generation (OpenAI/Hugging Face)
- **gpt2**: Standard GPT-2 with better quality (OpenAI)
- **distilbert-sentiment**: Sentiment analysis with conversational responses (Google/Hugging Face)
- **bert-qa**: Question answering with context (Google)
- **flan-t5-small**: Instruction-following text generation (Google)

### Azure OpenAI Models
- **GPT-3.5 Series**: `gpt-35-turbo`, `gpt-35-turbo-16k`
- **GPT-4 Series**: `gpt-4`, `gpt-4-32k`, `gpt-4-turbo`, `gpt-4o`
- **o1 Series**: `o1-mini`, `o1-preview` (reasoning models)

## API Endpoints

### Core Endpoints
- `GET /` - Main chat interface
- `POST /api/chat` - Send message to AI (works with both local and Azure models)
- `GET /api/health` - Health check and configuration status

### Local Model Management
- `POST /api/model/initialize` - Initialize/load a local model
- `GET /api/model/status` - Check local model status and configuration
- `GET /api/system/memory` - Monitor memory usage

### Debug Endpoints
- `GET /api/debug/env` - Environment variable debugging (sensitive values masked)

## Usage Examples

### Switching Between Models

```bash
# Switch to local model
curl -X POST http://localhost:3000/api/model/initialize \
  -H "Content-Type: application/json" \
  -d '{"modelName": "gpt2"}'

# Check model status
curl http://localhost:3000/api/model/status

# Send a chat message
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, how are you?"}'
```

### Testing Different Models

```bash
# Test lightweight model
curl -X POST http://localhost:3000/api/model/initialize \
  -H "Content-Type: application/json" \
  -d '{"modelName": "distilgpt2"}'

# Test instruction-following model
curl -X POST http://localhost:3000/api/model/initialize \
  -H "Content-Type: application/json" \
  -d '{"modelName": "flan-t5-small"}'

# Test sentiment analysis model
curl -X POST http://localhost:3000/api/model/initialize \
  -H "Content-Type: application/json" \
  -d '{"modelName": "distilbert-sentiment"}'
```

### Environment Variable Testing

```bash
# Check configuration
curl http://localhost:3000/api/health

# Debug environment variables
curl http://localhost:3000/api/debug/env

# Monitor memory usage
curl http://localhost:3000/api/system/memory
```

## Troubleshooting

### Local Model Issues

1. **"Model is loading" error**
   - Wait 30-60 seconds for model to download and initialize
   - Check `/api/model/status` for current status

2. **Memory issues**
   - Use smaller models (`distilgpt2` instead of `gpt2`)
   - Check memory usage with `/api/system/memory`
   - Restart the application to clear memory

3. **"Pipeline not ready" error**
   - Ensure Node.js version 18+ is installed
   - Check that `@xenova/transformers` is properly installed

4. **Poor response quality**
   - Try a larger model (`gpt2` instead of `distilgpt2`)
   - Consider switching to Azure OpenAI for production quality
   - Ensure you're using the right model for your task

### Azure OpenAI Issues

5. **"Configuration Error: Missing environment variables"**
   - Verify all required environment variables are set
   - Use `/api/debug/env` to check configuration

6. **"Azure OpenAI API Error (401)"**
   - Verify your API key is correct and not expired
   - Check that the key has proper permissions

7. **"Azure OpenAI API Error (404)"**
   - Verify your endpoint URL and deployment name
   - Ensure the model is properly deployed in Azure

### Model-Specific Issues

8. **o1 Model Issues**
   - o1 models don't support system roles or temperature
   - Use `max_completion_tokens` instead of `max_tokens`

9. **bert-qa model errors**
   - Q&A models need specific input format
   - Use for direct questions, not general conversation
   - Switch to `distilgpt2` for general chat

## Performance Optimization

### Local Models
- Start with `distilgpt2` for fastest performance
- Use `gpt2` for better quality if you have sufficient memory
- Monitor memory usage regularly with `/api/system/memory`
- Consider model switching based on request type

### Azure Deployment
- Use appropriate Azure plan for your chosen local model
- Enable build during deployment for proper dependency installation
- Consider using Azure OpenAI for production workloads requiring high quality

### Hybrid Approach
- Use local models for development and testing
- Switch to Azure OpenAI for production
- Implement fallback from local to cloud models

## Project Structure

```
webappchatbot/
├── public/
│   └── index.html          # Frontend chat interface
├── .github/
│   └── workflows/
│       └── main_joerob-chatbot.yml  # GitHub Actions deployment
├── server.js               # Main Express server with local model support
├── package.json           # Dependencies (includes @xenova/transformers)
├── package-lock.json      # Locked dependency versions
├── .env                   # Environment configuration (not in git)
├── .gitignore             # Git ignore rules
├── web.config             # IIS configuration for Azure
└── README.md              # This file
```

## Migration Guide

### From Azure-Only to Hybrid Mode

1. **Update dependencies**: `npm install @xenova/transformers dotenv`
2. **Create `.env` file**: Add local model configuration
3. **Update server.js**: Use the enhanced version with local model support
4. **Test locally**: Start with `distilgpt2` for testing
5. **Deploy**: Update Azure app settings for your preferred mode

### From Local-Only to Hybrid Mode

1. **Add Azure configuration**: Set Azure OpenAI environment variables
2. **Set fallback mode**: `USE_LOCAL_MODEL=false` to use Azure as primary
3. **Test both modes**: Verify both local and Azure models work

## Future Roadmap

### Planned Enhancements
- **Ollama Integration**: Support for larger open-source models locally
- **External Model APIs**: Integration with Hugging Face, Replicate, etc.
- **Model Switching UI**: Frontend interface for changing models
- **Quantized Models**: Support for smaller versions of larger models
- **Streaming Responses**: Real-time response streaming for better UX

### Open Source Model Support
- **Meta Llama**: Via Ollama or external APIs
- **Anthropic Claude**: Via API integration
- **Mistral Models**: Via Ollama or Hugging Face
- **Code Models**: CodeLlama, StarCoder via external services

## Contributing

1. Fork the repository
2. Create a feature branch
3. Test with both local and Azure models
4. Ensure memory usage is reasonable
5. Test with multiple model types
6. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues and questions:
1. **Local Model Issues**: Check memory usage and model status endpoints
2. **Azure Issues**: Verify configuration with debug endpoints
3. **Performance Issues**: Try different models or Azure plans
4. **Model Selection**: Use the recommendations above
5. **General Issues**: Open an issue in this repository

### Useful Debug Commands

```bash
# Check overall health
curl http://localhost:3000/api/health

# Check model status
curl http://localhost:3000/api/model/status

# Monitor memory
curl http://localhost:3000/api/system/memory

# Test environment variables
curl http://localhost:3000/api/debug/env

# Test model switching
curl -X POST http://localhost:3000/api/model/initialize \
  -H "Content-Type: application/json" \
  -d '{"modelName": "distilgpt2"}'
```

### Quick Start Recommendations

**New to AI models?** Start with `distilgpt2`
**Want better quality?** Use `gpt2` 
**Need instruction following?** Try `flan-t5-small`
**Production deployment?** Consider Azure OpenAI
**Limited memory?** Stick with `distilgpt2`
**Development/testing?** Any model works, `distilgpt2` is fastest