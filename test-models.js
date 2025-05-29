// Create this test file to check model availability
import { pipeline } from '@xenova/transformers';

const testModels = [
    'Xenova/LaMini-Flan-T5-248M',
    'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
    'Xenova/flan-t5-small',
    'Xenova/distilgpt2',
    'Xenova/gpt2'
];

async function testModelAvailability() {
    console.log('Testing model availability...\n');
    
    for (const modelName of testModels) {
        try {
            console.log(`Testing: ${modelName}`);
            
            if (modelName.includes('flan-t5') || modelName.includes('LaMini')) {
                const model = await pipeline('text2text-generation', modelName);
                console.log(`✅ ${modelName} - AVAILABLE`);
            } else if (modelName.includes('distilbert')) {
                const model = await pipeline('sentiment-analysis', modelName);
                console.log(`✅ ${modelName} - AVAILABLE`);
            } else {
                const model = await pipeline('text-generation', modelName);
                console.log(`✅ ${modelName} - AVAILABLE`);
            }
            
        } catch (error) {
            console.log(`❌ ${modelName} - FAILED: ${error.message}`);
        }
        
        console.log(''); // Add spacing
    }
}

testModelAvailability();