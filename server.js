require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs').promises;

// Import configurations
const { configureMulter } = require('./config/multer');
const { port } = require('./config/environment');

// Import middleware
const requestLogger = require('./middleware/requestLogger');

// Import routes
const chatRoutes = require('./routes/chat');
const websiteRoutes = require('./routes/website');
const modelRoutes = require('./routes/models');
const debugRoutes = require('./routes/debug');

// Import initialization
const { initializeServices } = require('./startup/initialize');

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(requestLogger);

// Configure file uploads
configureMulter(app);

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/website', websiteRoutes);
app.use('/api/model', modelRoutes);
app.use('/api', debugRoutes);

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

// Start server
app.listen(port, () => {
    console.log('\n🚀 SERVER STARTING 🚀');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Server running on port: ${port}`);
    console.log(`Health check: http://localhost:${port}/api/health`);
    console.log(`Environment debug: http://localhost:${port}/api/debug/env`);
    console.log(`Model status: http://localhost:${port}/api/model/status`);
    console.log(`Website crawl: http://localhost:${port}/api/website/status`);
    console.log(`Node version: ${process.version}`);
    console.log(`Platform: ${process.platform}`);
    console.log('========================\n');
    
    // Initialize services after server starts
    initializeServices().catch(console.error);
});