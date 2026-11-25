'use strict';

const fs = require('node:fs');

// Load a local .env for development (Node >= 20.12). In production, set env vars on the host.
if (fs.existsSync('.env') && typeof process.loadEnvFile === 'function') process.loadEnvFile('.env');

const { createApp } = require('./src/app');

const port = Number(process.env.PORT) || 8080;
const app = createApp();

const server = app.listen(port, () => {
  const ai = process.env.GEMINI_API_KEY ? 'Gemini enabled' : 'no GEMINI_API_KEY – using rule-based fallback';
  console.log(`SaafHawa listening on http://localhost:${port} (${ai})`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
