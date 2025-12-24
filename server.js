const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================================================
// CONFIGURATION
// =============================================================================

const config = {
  // Your Chrome extension ID (update if you republish)
  extensionId: 'lmpjbngkepccmecmcfokcggaedkpljdh',
  
  // Rate limiting
  rateLimitWindow: 60 * 1000,  // 1 minute
  rateLimitMax: 10,            // requests per window
  
  // Input validation
  maxPromptLength: 2000,
  minPromptLength: 3,
  
  // Request timeout (prevents hanging requests)
  requestTimeout: 30000,       // 30 seconds
  
  // Gemini settings
  geminiModel: 'gemini-1.5-flash',
  geminiTemperature: 0.3,
  geminiMaxTokens: 1000,
};

// =============================================================================
// LOGGING UTILITY
// =============================================================================

const log = {
  info: (message, data = {}) => {
    console.log(JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      message,
      ...data
    }));
  },
  error: (message, error = null, data = {}) => {
    console.error(JSON.stringify({
      level: 'error',
      timestamp: new Date().toISOString(),
      message,
      error: error?.message || error,
      stack: process.env.NODE_ENV !== 'production' ? error?.stack : undefined,
      ...data
    }));
  },
  warn: (message, data = {}) => {
    console.warn(JSON.stringify({
      level: 'warn',
      timestamp: new Date().toISOString(),
      message,
      ...data
    }));
  }
};

// =============================================================================
// MIDDLEWARE
// =============================================================================

// Security headers
app.use(helmet());

// Parse JSON with size limit
app.use(express.json({ limit: '10kb' }));

// CORS - restrict to your extension in production
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [`chrome-extension://${config.extensionId}`]
    : true
}));

// Rate limiting on API routes
const limiter = rateLimit({
  windowMs: config.rateLimitWindow,
  max: config.rateLimitMax,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Request timeout middleware
app.use((req, res, next) => {
  req.setTimeout(config.requestTimeout, () => {
    log.warn('Request timeout', { path: req.path, method: req.method });
    if (!res.headersSent) {
      res.status(408).json({ error: 'Request timeout' });
    }
  });
  next();
});

// =============================================================================
// ROUTES
// =============================================================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Prompt optimization endpoint
app.post('/api/optimize', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { prompt } = req.body;

    // Validation
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Valid prompt is required' });
    }

    const trimmedPrompt = prompt.trim();

    if (trimmedPrompt.length > config.maxPromptLength) {
      return res.status(400).json({ 
        error: `Prompt too long (max ${config.maxPromptLength} characters)` 
      });
    }

    if (trimmedPrompt.length < config.minPromptLength) {
      return res.status(400).json({ error: 'Prompt too short' });
    }

    // Call Gemini API
    const optimizedPrompt = await optimizeWithGemini(trimmedPrompt);

    const duration = Date.now() - startTime;
    log.info('Prompt optimized', {
      originalLength: prompt.length,
      optimizedLength: optimizedPrompt.length,
      durationMs: duration
    });

    res.json({
      success: true,
      optimizedPrompt,
      originalLength: prompt.length,
      optimizedLength: optimizedPrompt.length
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Optimization failed', error, { durationMs: duration });

    // Return appropriate error without exposing internals
    if (error.message.includes('API key')) {
      res.status(500).json({ error: 'Service configuration error' });
    } else if (error.message.includes('quota') || error.message.includes('429')) {
      res.status(429).json({ error: 'Service temporarily unavailable, please try again later' });
    } else if (error.message.includes('timeout')) {
      res.status(504).json({ error: 'Request timed out, please try again' });
    } else {
      res.status(500).json({ error: 'Optimization service unavailable' });
    }
  }
});

// =============================================================================
// GEMINI API INTEGRATION
// =============================================================================

async function optimizeWithGemini(prompt) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    throw new Error('API key not configured');
  }

  const systemPrompt = `You are PromptGenius, an expert at optimizing prompts for AI assistants.

Your task: Improve the user's prompt while STRICTLY preserving their original intent and scope.

RULES:
1. PRESERVE the original question's scope and openness - never narrow or constrain it
2. NEVER add specific examples, names, numbers, or limitations the user didn't request
3. NEVER transform broad/open questions into specific/narrow ones
4. Fix spelling and grammar errors
5. Add context only if it clarifies intent (not constraints)
6. Suggest output format only if genuinely helpful
7. If the prompt is already well-formed, return it with minimal changes

Original prompt: "${prompt}"

Return ONLY the improved prompt. No explanations, no preamble, no quotes around it.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout for API call

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: systemPrompt }]
          }],
          generationConfig: {
            temperature: config.geminiTemperature,
            maxOutputTokens: config.geminiMaxTokens,
          }
        }),
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      log.error('Gemini API error response', null, { 
        status: response.status,
        statusText: response.statusText 
      });
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('Invalid response from Gemini API');
    }

    return data.candidates[0].content.parts[0].text.trim();

  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('Gemini API timeout');
    }
    throw error;
  }
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

// Global error handler
app.use((error, req, res, next) => {
  log.error('Unhandled error', error, { path: req.path, method: req.method });
  
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// =============================================================================
// SERVER STARTUP & GRACEFUL SHUTDOWN
// =============================================================================

const server = app.listen(PORT, () => {
  log.info('Server started', { 
    port: PORT, 
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version
  });
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  log.info(`${signal} received, starting graceful shutdown`);
  
  server.close((err) => {
    if (err) {
      log.error('Error during shutdown', err);
      process.exit(1);
    }
    
    log.info('Server closed successfully');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    log.warn('Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled rejection', reason);
});
