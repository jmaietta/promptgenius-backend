const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting - 10 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});

// Middleware
app.use(express.json({ limit: '10kb' })); // Limit payload size
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['chrome-extension://*'] // Only allow Chrome extensions in production
    : true // Allow all origins in development
}));
app.use('/api', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Prompt optimization endpoint
app.post('/api/optimize', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    // Validation
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Valid prompt is required' });
    }
    
    if (prompt.length > 2000) {
      return res.status(400).json({ error: 'Prompt too long (max 2000 characters)' });
    }
    
    if (prompt.trim().length < 3) {
      return res.status(400).json({ error: 'Prompt too short' });
    }
    
    // Call Gemini API
    const optimizedPrompt = await optimizeWithGemini(prompt);
    
    res.json({ 
      success: true, 
      optimizedPrompt,
      originalLength: prompt.length,
      optimizedLength: optimizedPrompt.length
    });
    
  } catch (error) {
    console.error('Optimization error:', error);
    
    // Don't expose internal errors to client
    if (error.message.includes('API key')) {
      res.status(500).json({ error: 'Service configuration error' });
    } else if (error.message.includes('quota')) {
      res.status(429).json({ error: 'Service temporarily unavailable' });
    } else {
      res.status(500).json({ error: 'Optimization service unavailable' });
    }
  }
});

async function optimizeWithGemini(prompt) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  console.log('API Key loaded:', GEMINI_API_KEY ? 'YES' : 'NO', GEMINI_API_KEY?.slice(0,10) + '...');
  
  if (!GEMINI_API_KEY) {
    throw new Error('API key not configured');
  }
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are PromptGenius, an expert at optimizing prompts for AI assistants. 

Your task: Take the user's prompt and make it better while STRICTLY preserving their original intent and scope.

CRITICAL RULES:
- NEVER change the scope or add specific limitations the user didn't request
- NEVER suggest specific examples, names, or constrain open-ended questions  
- NEVER transform broad questions into narrow comparisons
- PRESERVE the user's original question structure and openness

Improvements to make:
- Fix spelling and grammar errors only
- Add helpful context for clarity (not constraints)
- Suggest output format if genuinely helpful
- Enhance clarity while keeping the same breadth

If the prompt is already clear and well-formed, make only minimal improvements or return it unchanged.

Original prompt: "${prompt}"

Return ONLY the improved prompt with no additional commentary.`
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1000,
        }
      })
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API error:', response.status, errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error('Invalid response from Gemini API');
  }
  
  return data.candidates[0].content.parts[0].text.trim();
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`PromptGenius backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});