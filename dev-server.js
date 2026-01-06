const express = require('express');
const path = require('path');

// Load local .env into process.env
try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch (e) {}

const handler = require('./api/create-payment-intent.js');

const app = express();
app.use(express.json({ limit: '1mb' }));

// Serve static files from project root
app.use(express.static(path.join(__dirname)));

// Mount the Vercel-style handler at /api/create-payment-intent
app.all('/api/create-payment-intent', async (req, res) => {
  try {
    // Call the existing handler directly
    await handler(req, res);
  } catch (err) {
    console.error('Dev server handler error:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'dev handler error', details: String(err && err.message) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Dev server running on http://localhost:${port}`);
});
