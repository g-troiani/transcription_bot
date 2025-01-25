/**
 * testDeepseek.js
 *
 * A standalone script to test the DeepSeek API call in a CommonJS environment.
 * Uses dynamic import for node-fetch (which is ESM-only in v3+).
 */

(async () => {
    // Load environment variables
    const dotenv = require('dotenv');
    dotenv.config();
  
    // Dynamically import node-fetch
    const { default: fetch } = await import('node-fetch');
  
    // Make sure we have the key from the environment
    const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
    if (!deepseekApiKey) {
      console.error('ERROR: DEEPSEEK_API_KEY is not set in your environment!');
      return;
    }
  
    console.log('Testing DeepSeek call...');
  
    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekApiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-reasoner',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that summarizes conversation transcripts.'
            },
            {
              role: 'user',
              content: 'Hello from testDeepseek.js. Please give me a brief greeting in return.'
            }
          ],
          stream: false
        })
      });
  
      if (!response.ok) {
        console.error(`DeepSeek responded with status: ${response.status}`);
        const errorText = await response.text();
        console.error('Response body:', errorText);
        return;
      }
  
      const result = await response.json();
      if (result.choices && result.choices.length > 0 && result.choices[0].message) {
        console.log('DeepSeek Response:', result.choices[0].message.content.trim());
      } else {
        console.log('Unexpected DeepSeek response format:', JSON.stringify(result, null, 2));
      }
  
    } catch (err) {
      console.error('Failed to call DeepSeek:', err);
    }
  })();
  
  