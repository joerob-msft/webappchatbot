function log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
        info: 'ℹ️',
        success: '✅',
        warning: '⚠️',
        error: '❌',
        debug: '🔍'
    }[level] || 'ℹ️';
    
    console.log(`${timestamp} ${prefix} ${message}`);
}

function logSuccess(message) {
    log(message, 'success');
}

function logWarning(message) {
    log(message, 'warning');
}

function logError(message) {
    log(message, 'error');
}

function logDebug(message) {
    log(message, 'debug');
}

module.exports = {
    log,
    logSuccess,
    logWarning,
    logError,
    logDebug
};