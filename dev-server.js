// ✅ Carregar variáveis de ambiente PRIMEIRO
require('dotenv').config();

const express = require('express');
const path = require('path');

// ✅ Importar TODOS os handlers da API
const createPaymentIntentHandler = require('./api/create-payment-intent.js');
const sendOrderEmailHandler = require('./api/send-order-email.js');
const webhookStripeHandler = require('./api/webhooks-stripe.js');

const app = express();

// Middleware para parsing JSON
// Permitir raw body para Stripe webhook antes do JSON parser
app.use('/api/webhooks-stripe', express.raw({ type: '*/*' }));
app.use(express.json({ limit: '1mb' }));

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname)));

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

// 2. Send Order Email ✅ ADICIONAR ESTE!
app.all('/api/send-order-email', async (req, res) => {
  try {
    await sendOrderEmailHandler(req, res);
  } catch (err) {
    console.error('❌ [send-order-email] Error:', err);
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



// Initialize Firebase Admin
const { getFirestore } = require('./api/lib/firebase-admin');
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
});