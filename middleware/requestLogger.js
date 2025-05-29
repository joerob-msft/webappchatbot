const { log } = require('../utils/logger');

function requestLogger(req, res, next) {
    const timestamp = new Date().toISOString();
    log(`${req.method} ${req.url}`, 'debug');
    
    // Log detailed info for POST requests
    if (req.method === 'POST' && req.body) {
        log(`Request body: ${JSON.stringify(req.body, null, 2)}`, 'debug');
    }
    
    next();
}

module.exports = requestLogger;