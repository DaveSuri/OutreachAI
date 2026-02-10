const { GoogleGenerativeAI } = require("@google/generative-ai");

// Load environment variables
require('dotenv').config({ path: '.env.local' });

async function testCurrentGeminiImplementation() {
  console.log('Testing current Gemini implementation from lib/ai/gemini.ts...');
  
  try {
    const client = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
    
    // Try the exact same model and approach as in the existing code
    const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    console.log('Sending test prompt...');
    
    const prompt = [
      "You are OutreachAI's voice assistant.",
      "Respond in 2-4 short sentences.",
      "User query: How are we doing today?",
      "Tool used: get_dashboard_stats",
      "Tool payload: {\"active_campaigns\": 3, \"total_leads\": 150, \"reply_rate\": 12}"
    ].join("\n");
    
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    console.log('✅ Gemini AI integration is working!');
    console.log('Response:', text);
    
  } catch (error) {
    console.error('❌ Error with gemini-1.5-flash:', error.message);
    
    // Try alternative models
    console.log('\nTrying alternative models...');
    
    const alternativeModels = ['gemini-pro', 'models/gemini-pro'];
    
    for (const modelName of alternativeModels) {
      try {
        console.log(`Trying model: ${modelName}`);
        const client = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
        const model = client.getGenerativeModel({ model: modelName });
        
        const result = await model.generateContent("Hello, this is a test.");
        console.log(`✅ ${modelName} works!`);
        break;
      } catch (altError) {
        console.log(`❌ ${modelName} failed:`, altError.message);
      }
    }
  }
}

testCurrentGeminiImplementation();