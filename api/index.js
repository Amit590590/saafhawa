'use strict';

// Serverless entry (Vercel-style): export the Express app as the request handler.
const { createApp } = require('../src/app');

module.exports = createApp();
