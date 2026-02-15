const OpenAI = require("openai");

// Load environment variables
require('dotenv').config({ path: '.env' });

async function testOpenAI() {
  console.log('Testing OpenAI integration...');
  
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  
  try {
    console.log('Sending test prompt to OpenAI...');
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You write concise, high-conversion cold emails. Return strict JSON with keys subject and body."
        },
        {
          role: "user",
          content: JSON.stringify({
            lead: {
              firstName: "John",
              lastName: "Smith",
              company: "Acme Corp"
            },
            template: "Hi {{firstName}}, quick idea for {{company}}."
          })
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const result = completion.choices[0]?.message?.content;
    console.log('✅ OpenAI integration is working!');
    console.log('Generated email:', result);
    
  } catch (error) {
    console.error('❌ Error testing OpenAI:', error.message);
  }
}

testOpenAI();