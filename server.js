const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Required for Render.com (and other reverse proxies)
app.set('trust proxy', 1);

// =============================================================================
// CONFIGURATION
// =============================================================================

const config = {
  extensionId: 'lmpjbngkepccmecmcfokcggaedkpljdh',
  rateLimitWindow: 60 * 1000,
  rateLimitMax: 10,
  maxPromptLength: 2000,
  minPromptLength: 3,
  requestTimeout: 30000,
  claudeModel: 'claude-sonnet-4-20250514',
  claudeMaxTokens: 2000,
};

// =============================================================================
// LOGGING
// =============================================================================

const log = {
  info: (message, data = {}) => {
    console.log(JSON.stringify({ level: 'info', timestamp: new Date().toISOString(), message, ...data }));
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
  }
};

// =============================================================================
// MIDDLEWARE
// =============================================================================

app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [`chrome-extension://${config.extensionId}`]
    : true
}));

const limiter = rateLimit({
  windowMs: config.rateLimitWindow,
  max: config.rateLimitMax,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

app.use((req, res, next) => {
  req.setTimeout(config.requestTimeout, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: 'Request timeout' });
    }
  });
  next();
});

// =============================================================================
// ROUTES
// =============================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

app.post('/api/optimize', async (req, res) => {
  const startTime = Date.now();

  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Valid prompt is required' });
    }

    const trimmedPrompt = prompt.trim();

    if (trimmedPrompt.length > config.maxPromptLength) {
      return res.status(400).json({ error: `Prompt too long (max ${config.maxPromptLength} characters)` });
    }

    if (trimmedPrompt.length < config.minPromptLength) {
      return res.status(400).json({ error: 'Prompt too short' });
    }

    const versions = await optimizeWithClaude(trimmedPrompt);
    const duration = Date.now() - startTime;

    log.info('Prompt optimized', { originalLength: prompt.length, durationMs: duration });

    res.json({
      success: true,
      versions,
      originalLength: prompt.length
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Optimization failed', error, { durationMs: duration });

    if (error.message.includes('API key') || error.message.includes('authentication')) {
      res.status(500).json({ error: 'Service configuration error' });
    } else if (error.message.includes('rate') || error.message.includes('429')) {
      res.status(429).json({ error: 'Service temporarily unavailable, please try again later' });
    } else if (error.message.includes('timeout')) {
      res.status(504).json({ error: 'Request timed out, please try again' });
    } else {
      res.status(500).json({ error: 'Optimization service unavailable' });
    }
  }
});

// =============================================================================
// CLAUDE API - PROMPT OPTIMIZATION ENGINE
// =============================================================================

async function optimizeWithClaude(prompt) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    throw new Error('API key not configured');
  }

  const systemPrompt = `You are an expert prompt engineer. Your job is to transform user prompts into highly effective prompts that get better results from AI assistants.

You will receive a user's original prompt and must create THREE optimized versions.

RULES:
- Preserve the user's core intent — do not change WHAT they're asking for
- Do not add requirements they didn't imply
- Do not narrow open-ended questions unless adding helpful structure
- Each version should be meaningfully different, not just rewording
- If the original prompt is already excellent, make only minor refinements

RESPOND IN THIS EXACT JSON FORMAT (no markdown, no code blocks, just raw JSON):
{
  "structured": "the structured version here",
  "detailed": "the detailed version here",
  "concise": "the concise version here"
}`;

  const userPrompt = `INPUT PROMPT:
"${prompt}"

CREATE THREE OPTIMIZED VERSIONS:

VERSION 1 - STRUCTURED:
- Break the request into clear, numbered steps or requirements
- Add explicit constraints (format, length, audience if inferrable)
- Include "Think step by step" or chain-of-thought triggers where appropriate
- Specify what a good response looks like

VERSION 2 - DETAILED:
- Assign a relevant expert role (e.g., "As an experienced software architect...")
- Add context about why this matters or how it will be used
- Request specific details, examples, or evidence
- Ask for pros/cons, tradeoffs, or multiple perspectives where relevant

VERSION 3 - CONCISE:
- Distill to the essential request
- Remove ambiguity with precise language
- Keep it brief but complete
- Fix any grammar or spelling issues

Return ONLY the JSON object with the three versions.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: config.claudeModel,
        max_tokens: config.claudeMaxTokens,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      log.error('Claude API error response', null, { status: response.status, body: errorBody.substring(0, 200) });
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.content || !data.content[0] || !data.content[0].text) {
      throw new Error('Invalid response from Claude API');
    }

    const rawText = data.content[0].text.trim();

    // Parse JSON response - handle potential markdown code blocks
    let jsonText = rawText;
    if (rawText.includes('```')) {
      jsonText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    try {
      const versions = JSON.parse(jsonText);

      // Validate response structure
      if (!versions.structured || !versions.detailed || !versions.concise) {
        throw new Error('Missing version in response');
      }

      return {
        structured: versions.structured.trim(),
        detailed: versions.detailed.trim(),
        concise: versions.concise.trim()
      };
    } catch (parseError) {
      log.error('Failed to parse Claude response', parseError, { rawText: rawText.substring(0, 500) });

      // Fallback: return the raw text as all three versions
      return {
        structured: rawText,
        detailed: rawText,
        concise: rawText
      };
    }

  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Claude API timeout');
    }
    throw error;
  }
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

app.use((error, req, res, next) => {
  log.error('Unhandled error', error, { path: req.path, method: req.method });
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

const server = app.listen(PORT, () => {
  log.info('Server started', { port: PORT, environment: process.env.NODE_ENV || 'development' });
});

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
  setTimeout(() => {
    log.info('Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception', error);
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection', reason);
});
