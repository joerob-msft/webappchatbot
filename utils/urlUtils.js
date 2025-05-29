function detectBaseUrl() {
    // Try multiple methods to get the correct Azure App Service URL
    if (process.env.WEBSITE_SITE_NAME) {
        // Method 1: Use WEBSITE_HOSTNAME (most reliable for Azure App Service)
        if (process.env.WEBSITE_HOSTNAME) {
            return `https://${process.env.WEBSITE_HOSTNAME}`;
        }
        
        // Method 2: Try to construct from available environment variables
        const possibleHosts = [
            process.env.HTTP_HOST,
            process.env.SERVER_NAME,
            process.env.WEBSITE_HOSTNAME,
            `${process.env.WEBSITE_SITE_NAME}.azurewebsites.net`
        ].filter(Boolean);
        
        if (possibleHosts.length > 0) {
            const host = possibleHosts[0];
            return host.startsWith('http') ? host : `https://${host}`;
        }
        
        // Method 3: Fallback to basic construction
        return `https://${process.env.WEBSITE_SITE_NAME}.azurewebsites.net`;
    } else {
        // Local development
        return `http://localhost:${process.env.PORT || 3000}`;
    }
}

module.exports = { detectBaseUrl };