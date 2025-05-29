# Azure OpenAI Web App Chatbot

A simple web-based chatbot powered by Azure OpenAI Service, built with Node.js and Express. This application supports multiple OpenAI models including GPT-3.5, GPT-4, and o1-series models with model-aware configuration.

## Features

- **Multi-Model Support**: Works with GPT-3.5, GPT-4, and o1-series models
- **Model-Aware Configuration**: Automatically adjusts API parameters based on the deployed model
- **Debug Mode**: Built-in debugging interface for troubleshooting
- **Azure Deployment Ready**: Configured for Azure Web Apps with GitHub Actions CI/CD
- **Health Monitoring**: Health check endpoints for monitoring application status

## Prerequisites

### Local Development
- **Node.js**: Version 14.0.0 or higher
- **npm**: Comes with Node.js
- **Git**: For version control

### Azure Resources
- **Azure Subscription**: Active Azure subscription
- **Azure OpenAI Service**: Deployed Azure OpenAI resource
- **Model Deployment**: At least one model deployed (GPT-3.5, GPT-4, or o1-series)

## Required Environment Variables

Set these environment variables in your local development environment or Azure Web App settings:

| Variable | Description | Example |
|----------|-------------|---------|
| `AZURE_OPENAI_ENDPOINT` | Your Azure OpenAI endpoint URL | `https://your-resource.openai.azure.com/` |
| `AZURE_OPENAI_KEY` | Your Azure OpenAI API key | `abcd1234...` |
| `AZURE_OPENAI_DEPLOYMENT` | Name of your deployed model | `gpt-4` or `gpt-35-turbo` or `o1-mini` |
| `AZURE_OPENAI_VERSION` | API version (optional) | `2024-08-01-preview` |
| `PORT` | Server port (optional) | `3000` |

### Finding Your Azure OpenAI Information

1. **Azure Portal**: Navigate to your Azure OpenAI resource
2. **Endpoint**: Found in the "Keys and Endpoint" section
3. **API Key**: Found in the "Keys and Endpoint" section
4. **Deployment Name**: Found in the "Model deployments" section

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

### 3. Set Environment Variables

#### Windows (Command Prompt)
```cmd
set AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
set AZURE_OPENAI_KEY=your-api-key-here
set AZURE_OPENAI_DEPLOYMENT=your-deployment-name
```

#### Windows (PowerShell)
```powershell
$env:AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com/"
$env:AZURE_OPENAI_KEY="your-api-key-here"
$env:AZURE_OPENAI_DEPLOYMENT="your-deployment-name"
```

#### macOS/Linux
```bash
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com/"
export AZURE_OPENAI_KEY="your-api-key-here"
export AZURE_OPENAI_DEPLOYMENT="your-deployment-name"
```

#### Using .env file (Recommended)
Create a `.env` file in the project root (already in .gitignore):
```env
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_KEY=your-api-key-here
AZURE_OPENAI_DEPLOYMENT=your-deployment-name
AZURE_OPENAI_VERSION=2024-08-01-preview
PORT=3000
```

### 4. Start the Application
```bash
npm start
```

### 5. Access the Application
- **Main Interface**: http://localhost:3000
- **Health Check**: http://localhost:3000/api/health
- **Debug Info**: http://localhost:3000/api/debug/env

## Azure Web App Deployment

### App Settings Configuration

In your Azure Web App, configure these application settings:

1. Go to Azure Portal → Your Web App → Configuration → Application settings
2. Add the following settings:

| Name | Value |
|------|-------|
| `AZURE_OPENAI_ENDPOINT` | `https://your-resource.openai.azure.com/` |
| `AZURE_OPENAI_KEY` | `your-api-key-here` |
| `AZURE_OPENAI_DEPLOYMENT` | `your-deployment-name` |
| `AZURE_OPENAI_VERSION` | `2024-08-01-preview` (optional) |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~22` |

### GitHub Actions Deployment

This project includes a GitHub Actions workflow for automatic deployment:

1. **Fork/Clone** this repository
2. **Configure Azure Web App** with the app settings above
3. **Set up GitHub secrets** (usually auto-configured when connecting GitHub to Azure)
4. **Push to main branch** to trigger deployment

## Supported Models

### GPT-3.5 Series
- `gpt-35-turbo`
- `gpt-35-turbo-16k`
- Supports system role, temperature, and standard parameters

### GPT-4 Series
- `gpt-4`
- `gpt-4-32k`
- `gpt-4-turbo`
- `gpt-4o`
- Supports system role, temperature, and standard parameters

### o1 Series (Reasoning Models)
- `o1-mini`
- `o1-preview`
- **Special Requirements**: No system role, uses `max_completion_tokens`, no temperature

## API Endpoints

- `GET /` - Main chat interface
- `POST /api/chat` - Send message to AI
- `GET /api/health` - Health check and configuration status
- `GET /api/debug/env` - Environment variable debugging

## Troubleshooting

### Common Issues

1. **"Configuration Error: Missing environment variables"**
   - Check that all required environment variables are set
   - Use the health check endpoint to verify configuration

2. **"Azure OpenAI API Error (401)"**
   - Verify your API key is correct and not expired
   - Check that the key has proper permissions

3. **"Azure OpenAI API Error (404)"**
   - Verify your endpoint URL and deployment name
   - Ensure the model is properly deployed in Azure

4. **o1 Model Issues**
   - o1 models don't support system roles or temperature
   - Use `max_completion_tokens` instead of `max_tokens`

### Debug Mode

The application includes a debug interface that shows:
- Configuration status
- Model information
- API version compatibility
- Environment variables (masked)

Access debug mode through the web interface or health check endpoint.

## Project Structure

```
webappchatbot/
├── public/
│   └── index.html          # Frontend chat interface
├── .github/
│   └── workflows/
│       └── main_joerob-chatbot.yml  # GitHub Actions deployment
├── server.js               # Main Express server
├── package.json           # Dependencies and scripts
├── web.config             # IIS configuration for Azure
├── .gitignore             # Git ignore rules
└── README.md              # This file
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Use the debug endpoints to gather information
3. Review Azure OpenAI service logs in Azure Portal
4. Open an issue in this repository