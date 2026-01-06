#!/usr/bin/env node
// Test harness to invoke the Vercel API handler for create-payment-intent
const path = require('path');
const handler = require(path.join(__dirname, '..', 'api', 'create-payment-intent.js'));

(async () => {
  const req = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      cartItems: [{ id: 'slimer-gel', quantity: 1 }],
      shippingAddress: { method: 'standard', postalCode: 'D02', city: 'Dublin', country: 'IE' },
      metadata: { customer_email: 'test@test.com', customer_name: 'Test User', items_count: 1 }
    },
    socket: { remoteAddress: '127.0.0.1' }
  };

  const res = {
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { console.log('\n=== RESPONSE ==='); console.log('Status:', this.statusCode || 200); console.log(JSON.stringify(obj, null, 2)); },
    end() { console.log('Response ended'); }
  };

  try {
    await handler(req, res);
  } catch (err) {
    console.error('Handler threw:', err && err.stack ? err.stack : err);
  }
})();
