#!/usr/bin/env node
'use strict';

// ============================================================
// smoke-test-site.js
// Run: SITE_URL=https://electricink.ie node scripts/smoke-test-site.js
// No external dependencies — only Node.js built-ins.
// ============================================================

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SITE_URL = (process.env.SITE_URL || 'https://electricink.ie').replace(/\/$/, '');
const INTERNAL_API_URL = (process.env.INTERNAL_API_URL || '').replace(/\/$/, '');

const TOTAL = 12;
let passed = 0;
let failed = 0;

// ────────── Output helpers ──────────

function pass(n, desc) {
  console.log(`CHECK ${n} — ${desc}: PASS`);
  passed++;
}

function fail(n, desc, got, expected) {
  console.log(`CHECK ${n} — ${desc}: FAIL (got: ${got}, expected: ${expected})`);
  failed++;
}

function info(n, desc, reason) {
  console.log(`CHECK ${n} — ${desc}: INFO (${reason})`);
  // Skipped checks do not increment passed or failed
}

// ────────── HTTP helper ──────────

function request(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlStr);
    } catch (e) {
      return reject(new Error(`Invalid URL: ${urlStr}`));
    }

    const lib = url.protocol === 'https:' ? https : http;
    const bodyBytes = options.body ? Buffer.from(options.body, 'utf8') : null;

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: Object.assign(
        { 'User-Agent': 'electricink-smoke-test/1.0' },
        options.headers || {}
      ),
      timeout: 20000,
    };

    if (bodyBytes) {
      reqOptions.headers['Content-Type'] =
        reqOptions.headers['Content-Type'] || 'application/json';
      reqOptions.headers['Content-Length'] = bodyBytes.length;
    }

    const req = lib.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out after 20s'));
    });

    if (bodyBytes) req.write(bodyBytes);
    req.end();
  });
}

// ────────── Checks ──────────

async function run() {
  let anyFailed = false;

  // ════════════════════════════════════════
  // SECTION 1 — STATIC & CONFIG ENDPOINTS
  // ════════════════════════════════════════

  // CHECK 1: GET /api/config
  try {
    const res = await request(`${SITE_URL}/api/config`);
    if (res.status === 200 && res.body.includes('STRIPE_PUBLISHABLE_KEY')) {
      pass(1, 'GET /api/config — 200 with STRIPE_PUBLISHABLE_KEY');
    } else {
      fail(
        1,
        'GET /api/config — 200 with STRIPE_PUBLISHABLE_KEY',
        `status=${res.status} body_contains_key=${res.body.includes('STRIPE_PUBLISHABLE_KEY')}`,
        'status=200 body_contains_key=true'
      );
      anyFailed = true;
    }
  } catch (e) {
    fail(1, 'GET /api/config — 200 with STRIPE_PUBLISHABLE_KEY', `error: ${e.message}`, 'status=200');
    anyFailed = true;
  }

  // CHECK 2: GET /api/catalog
  try {
    const res = await request(`${SITE_URL}/api/catalog`);
    let isJsonObject = false;
    try {
      const parsed = JSON.parse(res.body);
      isJsonObject = parsed !== null && typeof parsed === 'object';
    } catch (_) {}
    if (res.status === 200 && isJsonObject) {
      pass(2, 'GET /api/catalog — 200 with JSON array or object');
    } else {
      fail(
        2,
        'GET /api/catalog — 200 with JSON array or object',
        `status=${res.status} valid_json=${isJsonObject}`,
        'status=200 valid_json=true'
      );
      anyFailed = true;
    }
  } catch (e) {
    fail(2, 'GET /api/catalog — 200 with JSON array or object', `error: ${e.message}`, 'status=200');
    anyFailed = true;
  }

  // CHECK 3: GET /api/loyalty/rewards via INTERNAL_API_URL
  if (!INTERNAL_API_URL) {
    info(3, 'GET INTERNAL_API_URL/api/loyalty/rewards — 200 with JSON array', 'INTERNAL_API_URL not set — skipped');
  } else {
    try {
      const res = await request(`${INTERNAL_API_URL}/api/loyalty/rewards`);
      let isArray = false;
      try {
        isArray = Array.isArray(JSON.parse(res.body));
      } catch (_) {}
      if (res.status === 200 && isArray) {
        pass(3, 'GET INTERNAL_API_URL/api/loyalty/rewards — 200 with JSON array');
      } else {
        fail(
          3,
          'GET INTERNAL_API_URL/api/loyalty/rewards — 200 with JSON array',
          `status=${res.status} is_array=${isArray}`,
          'status=200 is_array=true'
        );
        anyFailed = true;
      }
    } catch (e) {
      fail(3, 'GET INTERNAL_API_URL/api/loyalty/rewards — 200 with JSON array', `error: ${e.message}`, 'status=200');
      anyFailed = true;
    }
  }

  // ════════════════════════════════════════
  // SECTION 2 — SECURITY HEADERS
  // ════════════════════════════════════════

  // CHECK 4: GET / — security headers present
  try {
    const res = await request(`${SITE_URL}/`);
    const h = res.headers;
    const missing = [];
    if (!h['x-content-type-options'])   missing.push('X-Content-Type-Options');
    if (!h['x-frame-options'])           missing.push('X-Frame-Options');
    if (!h['strict-transport-security']) missing.push('Strict-Transport-Security');
    if (!h['content-security-policy'])   missing.push('Content-Security-Policy');

    if (missing.length === 0) {
      pass(4, 'GET / — security headers present');
    } else {
      fail(
        4,
        'GET / — security headers present',
        `missing: ${missing.join(', ')}`,
        'all four headers present'
      );
      anyFailed = true;
    }
  } catch (e) {
    fail(4, 'GET / — security headers present', `error: ${e.message}`, 'all four headers present');
    anyFailed = true;
  }

  // ════════════════════════════════════════
  // SECTION 3 — PAYMENT ENDPOINT VALIDATION
  // ════════════════════════════════════════

  // CHECK 5: POST /api/create-payment-intent — empty body rejected
  try {
    const res = await request(`${SITE_URL}/api/create-payment-intent`, {
      method: 'POST',
      body: '{}',
    });
    if (res.status === 400) {
      pass(5, 'POST /api/create-payment-intent — empty body returns 400');
    } else {
      fail(
        5,
        'POST /api/create-payment-intent — empty body returns 400',
        `status=${res.status}`,
        'status=400'
      );
      anyFailed = true;
    }
  } catch (e) {
    fail(5, 'POST /api/create-payment-intent — empty body returns 400', `error: ${e.message}`, 'status=400');
    anyFailed = true;
  }

  // CHECK 6: POST /api/create-payment-intent — invalid quantity rejected
  try {
    const body = JSON.stringify({
      cartItems: [{ id: 'test', quantity: 999999, stripe_price_id: 'price_test' }],
      shippingMethod: 'standard',
    });
    const res = await request(`${SITE_URL}/api/create-payment-intent`, {
      method: 'POST',
      body,
    });
    if (res.status === 400) {
      pass(6, 'POST /api/create-payment-intent — quantity 999999 returns 400');
    } else {
      fail(
        6,
        'POST /api/create-payment-intent — quantity 999999 returns 400',
        `status=${res.status}`,
        'status=400'
      );
      anyFailed = true;
    }
  } catch (e) {
    fail(6, 'POST /api/create-payment-intent — quantity 999999 returns 400', `error: ${e.message}`, 'status=400');
    anyFailed = true;
  }

  // CHECK 7: POST /api/create-payment-intent — oversized address field rejected
  try {
    const body = JSON.stringify({
      cartItems: [{ id: 'test', quantity: 1, stripe_price_id: 'price_test' }],
      shippingMethod: 'standard',
      shippingAddress: { line1: 'A'.repeat(500) },
    });
    const res = await request(`${SITE_URL}/api/create-payment-intent`, {
      method: 'POST',
      body,
    });
    if (res.status === 400) {
      pass(7, 'POST /api/create-payment-intent — oversized shippingAddress.line1 returns 400');
    } else {
      fail(
        7,
        'POST /api/create-payment-intent — oversized shippingAddress.line1 returns 400',
        `status=${res.status}`,
        'status=400'
      );
      anyFailed = true;
    }
  } catch (e) {
    fail(7, 'POST /api/create-payment-intent — oversized shippingAddress.line1 returns 400', `error: ${e.message}`, 'status=400');
    anyFailed = true;
  }

  // ════════════════════════════════════════
  // SECTION 4 — COUPON ENDPOINT VALIDATION
  // ════════════════════════════════════════

  // CHECK 8: POST /api/validate-coupon — missing fields rejected
  try {
    const res = await request(`${SITE_URL}/api/validate-coupon`, {
      method: 'POST',
      body: '{}',
    });
    if (res.status === 400) {
      pass(8, 'POST /api/validate-coupon — empty body returns 400');
    } else {
      fail(
        8,
        'POST /api/validate-coupon — empty body returns 400',
        `status=${res.status}`,
        'status=400'
      );
      anyFailed = true;
    }
  } catch (e) {
    fail(8, 'POST /api/validate-coupon — empty body returns 400', `error: ${e.message}`, 'status=400');
    anyFailed = true;
  }

  // ════════════════════════════════════════
  // SECTION 5 — WEBHOOK SECURITY
  // ════════════════════════════════════════

  // CHECK 9: POST /api/webhooks-stripe — no signature returns 400
  try {
    const res = await request(`${SITE_URL}/api/webhooks-stripe`, {
      method: 'POST',
      body: '{}',
    });
    if (res.status === 400) {
      pass(9, 'POST /api/webhooks-stripe — no signature returns 400');
    } else {
      fail(
        9,
        'POST /api/webhooks-stripe — no signature returns 400',
        `status=${res.status}`,
        'status=400'
      );
      anyFailed = true;
    }
  } catch (e) {
    fail(9, 'POST /api/webhooks-stripe — no signature returns 400', `error: ${e.message}`, 'status=400');
    anyFailed = true;
  }

  // CHECK 10: POST /api/webhooks-stripe — fake signature returns 400
  try {
    const res = await request(`${SITE_URL}/api/webhooks-stripe`, {
      method: 'POST',
      headers: { 'stripe-signature': 'fake_signature_12345' },
      body: JSON.stringify({ type: 'payment_intent.succeeded' }),
    });
    if (res.status === 400) {
      pass(10, 'POST /api/webhooks-stripe — fake signature returns 400');
    } else {
      fail(
        10,
        'POST /api/webhooks-stripe — fake signature returns 400',
        `status=${res.status}`,
        'status=400'
      );
      anyFailed = true;
    }
  } catch (e) {
    fail(10, 'POST /api/webhooks-stripe — fake signature returns 400', `error: ${e.message}`, 'status=400');
    anyFailed = true;
  }

  // ════════════════════════════════════════
  // SECTION 6 — DUPLICATE ORDER PROTECTION
  // ════════════════════════════════════════

  // CHECK 11: Static — idempotencyKey in create-payment-intent.js
  {
    const filePath = path.resolve(__dirname, '..', 'api', 'create-payment-intent.js');
    try {
      const src = fs.readFileSync(filePath, 'utf8');
      if (src.includes('idempotencyKey')) {
        pass(11, 'api/create-payment-intent.js — contains idempotencyKey');
      } else {
        fail(11, 'api/create-payment-intent.js — contains idempotencyKey', 'string not found', 'string present');
        anyFailed = true;
      }
    } catch (e) {
      fail(11, 'api/create-payment-intent.js — contains idempotencyKey', `read error: ${e.message}`, 'string present');
      anyFailed = true;
    }
  }

  // CHECK 12: Static — orderAlreadyExists in webhooks-stripe.js
  {
    const filePath = path.resolve(__dirname, '..', 'api', 'webhooks-stripe.js');
    try {
      const src = fs.readFileSync(filePath, 'utf8');
      if (src.includes('orderAlreadyExists')) {
        pass(12, 'api/webhooks-stripe.js — contains orderAlreadyExists');
      } else {
        fail(12, 'api/webhooks-stripe.js — contains orderAlreadyExists', 'string not found', 'string present');
        anyFailed = true;
      }
    } catch (e) {
      fail(12, 'api/webhooks-stripe.js — contains orderAlreadyExists', `read error: ${e.message}`, 'string present');
      anyFailed = true;
    }
  }

  // ════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════
  console.log('══════════════════════════════════════');
  console.log(`SMOKE TEST SITE COMPLETE: ${passed}/${TOTAL} PASS`);
  console.log('══════════════════════════════════════');

  process.exit(anyFailed ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal error running smoke tests:', err);
  process.exit(1);
});
