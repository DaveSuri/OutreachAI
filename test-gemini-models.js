const { GoogleGenerativeAI } = require("@google/generative-ai");

// Load environment variables
require('dotenv').config({ path: '.env.local' });

async function listAvailableModels() {
  console.log('Listing available Gemini models...');
  
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
  
  try {
    // List all available models
    const result = await genAI.listModels();
    console.log('Available models:');
    result.models.forEach(model => {
      console.log(`- ${model.name}`);
    });
    
  } catch (error) {
    console.error('Error listing models:', error.message);
  }
}

async function testGeminiWithCorrectModel() {
  console.log('\nTesting Gemini AI with gemini-pro model...');
  
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
  
  try {
    // Use gemini-pro model which should be available
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    console.log('Sending test prompt to Gemini Pro...');
    
    const prompt = "Write a brief introduction for a cold email outreach campaign. Keep it professional and concise.";
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('Gemini Pro response:');
    console.log(text);
    console.log('\n✅ Gemini AI integration is working correctly!');
    
  } catch (error) {
    console.error('❌ Error testing Gemini AI:', error.message);
  }
}

// Run both functions
async function main() {
  await listAvailableModels();
  await testGeminiWithCorrectModel();
}

main();