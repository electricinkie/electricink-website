// ✅ Carregar variáveis de ambiente PRIMEIRO
require('dotenv').config();

const express = require('express');
const path = require('path');

// ✅ Importar TODOS os handlers da API (ajustado para caminho relativo após mover)
const createPaymentIntentHandler = require('../api/create-payment-intent.js');
const webhookStripeHandler = require('../api/webhooks-stripe.js');
// Local config handler (exposes publishable keys for local dev)
const configHandler = require('../api/config.js');

const app = express();

// Middleware para parsing JSON
// Permitir raw body para Stripe webhook antes do JSON parser
app.use('/api/webhooks-stripe', express.raw({ type: '*/*' }));
app.use(express.json({ limit: '1mb' }));

// Servir arquivos estáticos
// Static files middleware will be registered AFTER API routes (moved below)

// ══════════════════════════════════════════════════════
// MONTAR TODOS OS ENDPOINTS DA API
// ══════════════════════════════════════════════════════

// 1. Payment Intent
app.all('/api/create-payment-intent', async (req, res) => {
  try {
    await createPaymentIntentHandler(req, res);
  } catch (err) {
    console.error('❌ [create-payment-intent] Error:', err);
    res.status(500).json({ error: 'Handler error', details: err.message });
  }
});

// 2. Send Order Email is handled by unified /api/emails router below

// 2b. Local unified emails router (for testing consolidated endpoint)
const emailsRouter = require('../api/emails.js');
app.all('/api/emails', async (req, res) => {
  try {
    await emailsRouter(req, res);
  } catch (err) {
    console.error('❌ [emails] Error:', err);
    res.status(500).json({ error: 'Handler error', details: err.message });
  }
});

// 2c. Local admin router
const adminRouter = require('../api/admin.js');
app.all('/api/admin', async (req, res) => {
  try {
    await adminRouter(req, res);
  } catch (err) {
    console.error('❌ [admin] Error:', err);
    res.status(500).json({ error: 'Handler error', details: err.message });
  }
});

// 3. Stripe Webhooks
console.log('🔧 Registrando rota do webhook...');
console.log('🔧 Webhook handler type:', typeof webhookStripeHandler);
app.all('/api/webhooks-stripe', async (req, res) => {
  try {
    await webhookStripeHandler(req, res);
  } catch (err) {
    console.error('❌ [webhooks-stripe] Error:', err);
    res.status(500).json({ error: 'Handler error', details: err.message });
  }
});
console.log('✅ Rota do webhook registrada');

// 4. Local config (exposes publishable keys to frontend during development)
app.all('/api/config', async (req, res) => {
  try {
    await configHandler(req, res);
  } catch (err) {
    console.error('❌ [config] Error:', err);
    res.status(500).json({ error: 'Handler error', details: err.message });
  }
});

// My Orders endpoint
app.get('/api/my-orders', async (req, res) => {
  try {
    const handler = require('../api/my-orders');
    await handler(req, res);
  } catch (err) {
    console.error('[SERVER] /api/my-orders error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// ADDED: /api/my-orders registered here

// Serve static files from project root (dev-server moved into scripts/)
// Intelligent cache headers middleware (placed before static middleware)
app.use((req, res, next) => {
  try {
    const filePath = req.path || '';
    let cacheControl;
    if (filePath.endsWith('.html') || filePath === '/' || filePath.endsWith('.htm')) {
      // HTML: always fetch fresh
      cacheControl = 'no-cache, no-store, must-revalidate';
    } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      // JS/CSS: short cache with revalidation
      cacheControl = 'public, max-age=300, must-revalidate';
    } else if (filePath.match(/\.(jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf)$/)) {
      // Static assets: long cache
      cacheControl = 'public, max-age=86400';
    } else {
      cacheControl = 'no-cache';
    }

    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } catch (e) {
    // If anything goes wrong, fall back to no-cache
    try {
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } catch (err) {}
  }
  next();
});

app.use(express.static(path.join(__dirname, '..')));



// Initialize Firebase Admin
const { getFirestore } = require('../api/lib/firebase-admin');
try {
  getFirestore();
  console.log('✅ Firebase Admin initialized');
} catch (error) {
  console.error('❌ Firebase Admin initialization failed:', error.message);
  process.exit(1);
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Dev server running on http://localhost:${port}`);
  console.log(`📧 Email endpoint: http://localhost:${port}/api/send-order-email`);
  console.log(`💳 Payment endpoint: http://localhost:${port}/api/create-payment-intent`);
  console.log(`🔔 Webhook endpoint: http://localhost:${port}/api/webhooks-stripe`);
  console.log(`🔑 RESEND_API_KEY: ${process.env.RESEND_API_KEY ? '✅ Loaded' : '❌ Missing'}`);
  // DEBUG: list registered routes to help diagnose missing handlers
  try {
    const routes = (app._router && app._router.stack)
      ? app._router.stack.filter(r => r.route).map(r => r.route.path)
      : [];
    console.log('📍 [SERVER] Rotas registradas:', routes);
  } catch (e) {
    console.warn('📍 [SERVER] Could not list routes:', e && e.message);
  }
});