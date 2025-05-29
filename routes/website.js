const express = require('express');
const router = express.Router();
const { crawlAndIndexWebsite, getWebsiteCrawlData } = require('../services/crawling');
const { getDocumentEmbeddings } = require('../services/ragService');
const { detectBaseUrl } = require('../utils/urlUtils');
const { websiteMaxPages, websiteCrawlDelay } = require('../config/environment');
const { logSuccess, logError } = require('../utils/logger');

// Manual website crawl
router.post('/crawl', async (req, res) => {
    console.log('\n=== WEBSITE CRAWL REQUEST ===');
    
    try {
        const { 
            baseUrl, 
            maxPages = 20, 
            respectRobots = true, 
            includeExternalLinks = false,
            crawlDelay = 1000 
        } = req.body;
        
        if (!baseUrl) {
            return res.status(400).json({
                error: 'Base URL is required',
                details: 'Please provide a baseUrl to crawl'
            });
        }
        
        const websiteCrawlData = getWebsiteCrawlData();
        if (websiteCrawlData.crawlInProgress) {
            return res.status(409).json({
                error: 'Crawl already in progress',
                details: 'Please wait for the current crawl to complete'
            });
        }
        
        // Validate URL
        try {
            new URL(baseUrl);
        } catch (error) {
            return res.status(400).json({
                error: 'Invalid URL',
                details: 'Please provide a valid HTTP(S) URL'
            });
        }
        
        // Start crawling (don't await - return immediately)
        crawlAndIndexWebsite(baseUrl, {
            maxPages,
            respectRobots,
            includeExternalLinks,
            crawlDelay
        }).catch(error => {
            logError(`Website crawl failed: ${error.message}`);
        });
        
        logSuccess(`Website crawl started for: ${baseUrl}`);
        
        res.json({
            success: true,
            message: 'Website crawl started',
            baseUrl: baseUrl,
            options: { maxPages, respectRobots, includeExternalLinks, crawlDelay },
            status: 'in-progress'
        });
        
    } catch (error) {
        logError(`Website crawl request error: ${error.message}`);
        res.status(500).json({
            error: 'Failed to start website crawl',
            details: error.message
        });
    }
});

// Auto-crawl current website (POST endpoint)
router.post('/auto-crawl', async (req, res) => {
    try {
        const baseUrl = detectBaseUrl();
        
        console.log(`Auto-crawl starting for: ${baseUrl}`);
        
        const websiteCrawlData = getWebsiteCrawlData();
        if (websiteCrawlData.crawlInProgress) {
            return res.json({
                success: false,
                message: 'Auto-crawl already in progress',
                status: 'in-progress',
                baseUrl: baseUrl,
                crawledPages: websiteCrawlData.crawledPages
            });
        }
        
        // Start auto-crawl
        crawlAndIndexWebsite(baseUrl, {
            maxPages: websiteMaxPages,
            respectRobots: false, // Skip robots.txt for own site
            includeExternalLinks: false,
            crawlDelay: websiteCrawlDelay
        }).catch(error => {
            logError(`Auto-crawl failed: ${error.message}`);
        });
        
        logSuccess(`Auto-crawl started for: ${baseUrl}`);
        
        res.json({
            success: true,
            message: 'Auto-crawl started for current website',
            baseUrl: baseUrl,
            environment: process.env.WEBSITE_SITE_NAME ? 'Azure App Service' : 'Local'
        });
        
    } catch (error) {
        logError(`Failed to start auto-crawl: ${error.message}`);
        res.status(500).json({
            error: 'Failed to start auto-crawl',
            details: error.message
        });
    }
});

// Auto-crawl current website (GET endpoint)
router.get('/auto-crawl', async (req, res) => {
    try {
        const baseUrl = detectBaseUrl();
        
        const websiteCrawlData = getWebsiteCrawlData();
        if (websiteCrawlData.crawlInProgress) {
            return res.json({
                success: false,
                message: 'Auto-crawl already in progress',
                status: 'in-progress',
                baseUrl: baseUrl,
                crawledPages: websiteCrawlData.crawledPages
            });
        }
        
        // Start auto-crawl
        crawlAndIndexWebsite(baseUrl, {
            maxPages: websiteMaxPages,
            respectRobots: false, // Skip robots.txt for own site
            includeExternalLinks: false,
            crawlDelay: websiteCrawlDelay
        }).catch(error => {
            logError(`Auto-crawl failed: ${error.message}`);
        });
        
        logSuccess(`Auto-crawl started for: ${baseUrl}`);
        
        res.json({
            success: true,
            message: 'Auto-crawl started for current website',
            baseUrl: baseUrl,
            environment: process.env.WEBSITE_SITE_NAME ? 'Azure App Service' : 'Local',
            tip: 'Check status at /api/website/status'
        });
        
    } catch (error) {
        logError(`Failed to start auto-crawl: ${error.message}`);
        res.status(500).json({
            error: 'Failed to start auto-crawl',
            details: error.message
        });
    }
});

// Get website crawl status
router.get('/status', (req, res) => {
    const websiteCrawlData = getWebsiteCrawlData();
    const documentEmbeddings = getDocumentEmbeddings();
    
    res.json({
        crawl: websiteCrawlData,
        websiteContent: {
            pages: documentEmbeddings.filter(d => d.type === 'website').length > 0 ? 
                   [...new Set(documentEmbeddings.filter(d => d.type === 'website').map(d => d.url))].length : 0,
            chunks: documentEmbeddings.filter(d => d.type === 'website').length
        },
        timestamp: new Date().toISOString()
    });
});

module.exports = router;