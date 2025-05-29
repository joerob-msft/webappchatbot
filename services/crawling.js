const axios = require('axios');
const cheerio = require('cheerio');
const robotsParser = require('robots-parser');
const { websiteMaxPages, websiteCrawlDelay, isAzureAppService } = require('../config/environment');
const { detectBaseUrl } = require('../utils/urlUtils');
const { chunkText } = require('../utils/textUtils');
const { processWebsitePages, getDocumentEmbeddings, setDocumentEmbeddings, addToDocumentStore, getEmbedder } = require('./ragService');
const { logSuccess, logWarning, logError } = require('../utils/logger');

// State
let websiteCrawlData = {
    lastCrawl: null,
    crawlInProgress: false,
    crawledPages: 0,
    errors: []
};

async function crawlWebsite(baseUrl, options = {}) {
    const {
        maxPages = websiteMaxPages,
        respectRobots = true,
        includeExternalLinks = false,
        crawlDelay = websiteCrawlDelay,
        userAgent = 'WebAppChatbot/1.0'
    } = options;

    console.log(`\n=== STARTING WEBSITE CRAWL ===`);
    console.log('Base URL:', baseUrl);
    console.log('Max pages:', maxPages);
    console.log('Crawl delay:', crawlDelay + 'ms');

    websiteCrawlData.crawlInProgress = true;
    websiteCrawlData.errors = [];
    websiteCrawlData.crawledPages = 0;

    const visitedUrls = new Set();
    const urlsToVisit = [baseUrl];
    const crawledPages = [];
    let robotsTxt = null;

    // Check robots.txt if requested
    if (respectRobots) {
        try {
            const robotsUrl = new URL('/robots.txt', baseUrl).href;
            const robotsResponse = await axios.get(robotsUrl, { timeout: 5000 });
            robotsTxt = robotsParser(robotsUrl, robotsResponse.data);
            logSuccess('Loaded robots.txt');
        } catch (error) {
            console.log('ℹ️  No robots.txt found or accessible');
        }
    }

    while (urlsToVisit.length > 0 && crawledPages.length < maxPages) {
        const currentUrl = urlsToVisit.shift();
        
        if (visitedUrls.has(currentUrl)) continue;
        visitedUrls.add(currentUrl);

        // Check robots.txt permissions
        if (robotsTxt && !robotsTxt.isAllowed(currentUrl, userAgent)) {
            console.log(`🚫 Robots.txt disallows: ${currentUrl}`);
            continue;
        }

        try {
            console.log(`🔍 Crawling: ${currentUrl}`);
            
            const response = await axios.get(currentUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': userAgent
                }
            });

            if (response.headers['content-type']?.includes('text/html')) {
                const $ = cheerio.load(response.data);
                
                // Extract page content
                const pageData = extractPageContent($, currentUrl);
                
                if (pageData.content.trim().length > 100) { // Only store pages with substantial content
                    crawledPages.push(pageData);
                    websiteCrawlData.crawledPages++;
                    logSuccess(`Extracted content from: ${pageData.title || currentUrl}`);
                }

                // Find more URLs to crawl
                if (crawledPages.length < maxPages) {
                    const newUrls = extractLinksFromPage($, currentUrl, baseUrl, includeExternalLinks);
                    newUrls.forEach(url => {
                        if (!visitedUrls.has(url) && !urlsToVisit.includes(url)) {
                            urlsToVisit.push(url);
                        }
                    });
                }
            }

            // Respectful crawling delay
            if (crawlDelay > 0) {
                await new Promise(resolve => setTimeout(resolve, crawlDelay));
            }

        } catch (error) {
            logError(`Error crawling ${currentUrl}: ${error.message}`);
            websiteCrawlData.errors.push({
                url: currentUrl,
                error: error.message
            });
        }
    }

    websiteCrawlData.crawlInProgress = false;
    websiteCrawlData.lastCrawl = new Date().toISOString();

    console.log(`=== CRAWL COMPLETE ===`);
    console.log(`Crawled ${crawledPages.length} pages`);
    console.log(`Errors: ${websiteCrawlData.errors.length}`);

    return crawledPages;
}

function extractPageContent($, url) {
    // Remove unwanted elements
    $('script, style, nav, header, footer, .sidebar, .menu, .navigation').remove();
    
    // Extract title
    const title = $('title').text().trim() || 
                  $('h1').first().text().trim() || 
                  'Untitled Page';
    
    // Extract meta description
    const description = $('meta[name="description"]').attr('content') || '';
    
    // Extract main content
    let content = '';
    
    // Try common content containers first
    const contentSelectors = [
        'main',
        '[role="main"]',
        '.content',
        '.main-content',
        '.post-content',
        '.article-content',
        'article',
        '.page-content'
    ];
    
    for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length > 0) {
            content = element.text().trim();
            break;
        }
    }
    
    // Fallback to body content if no specific container found
    if (!content) {
        content = $('body').text().trim();
    }
    
    // Clean up content
    content = content
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .replace(/\n+/g, '\n') // Normalize line breaks
        .trim();
    
    // Extract headings for structure
    const headings = [];
    $('h1, h2, h3, h4, h5, h6').each((i, el) => {
        const text = $(el).text().trim();
        const level = el.tagName.toLowerCase();
        if (text) {
            headings.push({ level, text });
        }
    });
    
    return {
        url,
        title,
        description,
        content,
        headings,
        wordCount: content.split(' ').length,
        extractedAt: new Date().toISOString()
    };
}

function extractLinksFromPage($, currentUrl, baseUrl, includeExternalLinks) {
    const links = [];
    const currentDomain = new URL(baseUrl).hostname;
    
    $('a[href]').each((i, el) => {
        try {
            const href = $(el).attr('href');
            const absoluteUrl = new URL(href, currentUrl).href;
            const urlObj = new URL(absoluteUrl);
            
            // Skip non-HTTP(S) links
            if (!['http:', 'https:'].includes(urlObj.protocol)) return;
            
            // Skip file extensions that aren't web pages
            const skipExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.tar', '.gz', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.mp3', '.mp4', '.avi'];
            if (skipExtensions.some(ext => urlObj.pathname.toLowerCase().endsWith(ext))) return;
            
            // Include external links only if specified
            if (!includeExternalLinks && urlObj.hostname !== currentDomain) return;
            
            // Skip common non-content URLs
            const skipPatterns = ['/wp-admin/', '/admin/', '/login/', '/logout/', '/register/', '/cart/', '/checkout/'];
            if (skipPatterns.some(pattern => urlObj.pathname.includes(pattern))) return;
            
            links.push(absoluteUrl);
        } catch (error) {
            // Invalid URL, skip
        }
    });
    
    return [...new Set(links)]; // Remove duplicates
}

async function crawlAndIndexWebsite(baseUrl = null, options = {}) {
    let targetUrl = baseUrl;
    
    if (!targetUrl) {
        targetUrl = detectBaseUrl();
    }
    
    console.log(`\n=== CRAWL AND INDEX WEBSITE ===`);
    console.log('Detected URL:', targetUrl);
    console.log('Environment:', isAzureAppService ? 'Azure App Service' : 'Local');
    
    try {
        // Validate URL format
        const urlObj = new URL(targetUrl);
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
            throw new Error('Invalid URL protocol. Must be HTTP or HTTPS.');
        }
        
        // Crawl the website
        const pages = await crawlWebsite(targetUrl, options);
        
        if (pages.length === 0) {
            console.log('No pages found to index');
            return [];
        }
        
        const embedder = getEmbedder();
        let documentEmbeddings = getDocumentEmbeddings();
        
        // For Azure App Service OR when embedder is not available, store pages without embeddings
        if (isAzureAppService || !embedder) {
            console.log('🌐 Storing pages without embeddings (Azure App Service mode or embedder unavailable)');
            
            // Remove old website content
            documentEmbeddings = documentEmbeddings.filter(d => d.type !== 'website');
            setDocumentEmbeddings(documentEmbeddings);
            
            // Create simple chunks without embeddings
            const websiteChunks = [];
            
            for (const page of pages) {
                console.log(`Processing: ${page.title}`);
                
                // Create structured content for better chunking
                let structuredContent = `${page.title}\n\n`;
                if (page.description) {
                    structuredContent += `${page.description}\n\n`;
                }
                structuredContent += page.content;
                
                // Chunk the content
                const chunks = chunkText(structuredContent, 500, 50);
                
                // Store chunks without embeddings for simple text search
                for (let i = 0; i < chunks.length; i++) {
                    const chunk = chunks[i];
                    websiteChunks.push({
                        chunk,
                        embedding: null, // No embedding when embedder unavailable
                        source: `${page.title} (${page.url})`,
                        url: page.url,
                        title: page.title,
                        chunkIndex: i,
                        pageIndex: pages.indexOf(page),
                        type: 'website'
                    });
                }
            }
            
            // Add chunks to storage
            documentEmbeddings.push(...websiteChunks);
            setDocumentEmbeddings(documentEmbeddings);
            
            // Add website info to document store
            const websiteDoc = {
                filename: `Website: ${targetUrl}`,
                type: 'website',
                uploadedAt: new Date().toISOString(),
                chunks: websiteChunks.length,
                pages: pages.length,
                totalLength: pages.reduce((sum, page) => sum + page.content.length, 0),
                baseUrl: targetUrl,
                note: embedder ? 'With embeddings' : 'No embeddings - text search only'
            };
            
            addToDocumentStore(websiteDoc);
            
            logSuccess(`Website indexing complete (${embedder ? 'with' : 'without'} embeddings): ${pages.length} pages, ${websiteChunks.length} chunks`);
            return pages;
            
        } else {
            // Local development with embeddings available
            const websiteChunks = await processWebsitePages(pages);
            
            // Remove old website content
            documentEmbeddings = documentEmbeddings.filter(d => d.type !== 'website');
            
            // Add new website content
            documentEmbeddings.push(...websiteChunks);
            setDocumentEmbeddings(documentEmbeddings);
            
            // Add website info to document store
            const websiteDoc = {
                filename: `Website: ${targetUrl}`,
                type: 'website',
                uploadedAt: new Date().toISOString(),
                chunks: websiteChunks.length,
                pages: pages.length,
                totalLength: pages.reduce((sum, page) => sum + page.content.length, 0),
                baseUrl: targetUrl
            };
            
            addToDocumentStore(websiteDoc);
            
            logSuccess(`Website indexing complete: ${pages.length} pages, ${websiteChunks.length} chunks`);
            return pages;
        }
        
    } catch (error) {
        logError(`Error during website crawl and index: ${error.message}`);
        websiteCrawlData.crawlInProgress = false;
        throw error;
    }
}

module.exports = {
    crawlWebsite,
    extractPageContent,
    extractLinksFromPage,
    crawlAndIndexWebsite,
    getWebsiteCrawlData: () => websiteCrawlData
};