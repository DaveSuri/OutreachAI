const { GoogleGenerativeAI } = require("@google/generative-ai");

// Load environment variables
require('dotenv').config({ path: '.env.local' });

async function testGemini() {
  console.log('Testing Gemini AI integration...');
  
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
  
  try {
    // Get the model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    console.log('Sending test prompt to Gemini...');
    
    const prompt = "Write a brief introduction for a cold email outreach campaign. Keep it professional and concise.";
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('Gemini response:');
    console.log(text);
    console.log('\n✅ Gemini AI integration is working correctly!');
    
  } catch (error) {
    console.error('❌ Error testing Gemini AI:', error.message);
  }
}

testGemini();