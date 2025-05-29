const { ragChunkSize, ragChunkOverlap } = require('../config/environment');

// Chunk text into smaller pieces
function chunkText(text, chunkSize = ragChunkSize, overlap = ragChunkOverlap) {
    const words = text.split(/\s+/);
    const chunks = [];
    
    for (let i = 0; i < words.length; i += chunkSize - overlap) {
        const chunk = words.slice(i, i + chunkSize).join(' ');
        if (chunk.trim()) {
            chunks.push(chunk.trim());
        }
    }
    
    return chunks;
}

// Calculate cosine similarity
function cosineSimilarity(a, b) {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

module.exports = {
    chunkText,
    cosineSimilarity
};