const { Resend } = require('resend');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

async function testResend() {
  console.log('Testing Resend integration...');
  
  const resend = new Resend(process.env.RESEND_API_KEY);
  
  try {
    console.log('Sending test email...');
    
    const response = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: 'devansh264127@gmail.com',
      subject: 'Test Email from OutreachAI',
      html: '<p>This is a test email to verify Resend integration is working properly!</p><p>If you received this, the configuration is successful.</p>'
    });
    
    console.log('Email sent successfully!');
    console.log('Response:', response);
    
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

testResend();