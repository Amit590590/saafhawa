// @ts-check
'use strict';

/**
 * Vercel serverless entry: the Express app is the request handler for /api/*.
 * Static files in public/ are served by Vercel's CDN (see vercel.json).
 */
const { createApp } = require('../src/app');

module.exports = createApp();
