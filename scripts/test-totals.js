#!/usr/bin/env node
// End-to-end totals tests for api/create-payment-intent.js (real handler, simulated
// Stripe, simulated internal catalog, simulated Date.now). No network, no keys.
// Run: node scripts/test-totals.js
'use strict';
const assert = require('assert');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const HANDLER_PATH = require.resolve(path.join(ROOT, 'api', 'create-payment-intent.js'));
const CAMPAIGN_CONFIG = require(path.join(ROOT, 'campaign.config.json'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const cappedConfig = () => {
  const cfg = clone(CAMPAIGN_CONFIG);
  cfg.vault.items.forEach((item) => {
    item.capPerOrder = item.productId === 'raven-black-fineline' && item.variantId === 'raven-fineline-240' ? 3 : 6;
  });
  cfg.bundles.forEach((bundle) => { bundle.capPerOrder = 2; });
  cfg.boost.maxUnitsPerOrder = 4;
  return cfg;
};
const uncappedConfig = () => {
  const cfg = clone(CAMPAIGN_CONFIG);
  cfg.vault.items.forEach((item) => { delete item.capPerOrder; });
  cfg.bundles.forEach((bundle) => { delete bundle.capPerOrder; });
  delete cfg.boost.maxUnitsPerOrder;
  return cfg;
};

// Output goes through print; console.* is captured so the handler's logger stays quiet.
const print = console.log.bind(console);
let logs = [];
const capture = (...args) => { logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); };
console.log = capture; console.warn = capture; console.error = capture;

// Fake internal URL: fetch only answers this one; anything else fails the test.
process.env.INTERNAL_API_URL = 'http://internal.test';

// ── Simulated clock ──
const realDateNow = Date.now;
let fakeNow = 0;
Date.now = () => fakeNow;
const BEFORE = Date.parse('2026-11-20T12:00:00Z'); // before startsAt 2026-11-27T00:00:00Z
const OPEN = Date.parse('2026-11-28T12:00:00Z');   // inside the window

// ── Simulated Stripe (require('stripe') returns this factory) ──
const stripeCalls = { create: [], promoList: 0, couponRetrieve: 0 };
const stripeMock = {
  paymentIntents: {
    create: async (params, opts) => {
      stripeCalls.create.push({ params, opts });
      return { id: 'pi_test_' + stripeCalls.create.length, client_secret: 'pi_test_secret' };
    }
  },
  promotionCodes: { list: async () => { stripeCalls.promoList++; return { data: [] }; } },
  coupons: { retrieve: async () => { stripeCalls.couponRetrieve++; throw new Error('No such coupon'); } }
};
const stripeFactory = () => stripeMock;

// ── Module interception: 'stripe' mocked; optional forced failure of one request ──
let failRequest = null;
let campaignConfigOverride = null;
const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'stripe') return stripeFactory;
  if (failRequest && request === failRequest) throw new Error('simulated load failure: ' + request);
  if (request === '../campaign.config.json' && campaignConfigOverride) return campaignConfigOverride;
  return realLoad.apply(this, arguments);
};

// ── Simulated internal catalog (/api/products rows, prices ex VAT) ──
// loadProducts turns price_ex into gross with parseFloat((ex * 1.23).toFixed(2)),
// so ex = gross / 1.23 gives back exactly the gross written here.
const ex = (gross) => gross / 1.23;
const row = (id, variantId, gross, promoGross, stock = 50) => ({
  id, name: id, category: 'Test', variant_id: variantId, label: variantId,
  price_ex: ex(gross), promo_price_ex: promoGross === undefined ? null : ex(promoGross),
  promo_ends_at: null, stock
});
const SUMI = ['sumi-1-gi', 'sumi-2-yuu', 'sumi-3-jin', 'sumi-4-rei', 'sumi-5-makoto', 'sumi-6-meiyo'];
const NEEDLES = Array.from({ length: 10 }, (_, i) => 'needle-cartridge-box-' + String(i + 1).padStart(2, '0'));
function catalog({ vaultPromo, ravenStock = 50, sumiStock = 50 }) {
  return [
    // Vault: Raven 30 list 26, promo 13; Fineline 240 list 49, promo 24.50
    row('raven-black', 'raven-30', 26, vaultPromo ? 13 : undefined, ravenStock),
    row('raven-black-fineline', 'raven-fineline-240', 49, vaultPromo ? 24.5 : undefined),
    // Outside the Vault: 12
    row('cartridge-box', 'cartridge-box-20', 12),
    // Sumi: 6 x 26
    // sumiStock applies to the third variant only; the other five keep 50
    ...SUMI.map((v, i) => row('sumi', v, 26, undefined, i === 2 ? sumiStock : 50)),
    // Long ids for the metadata split case: 5 each
    ...NEEDLES.map((v) => row('needles', v, 5))
  ];
}
let catalogRows = catalog({ vaultPromo: true });
const fetchCalls = [];
global.fetch = async (url, opts) => {
  fetchCalls.push({ url, opts });
  if (url !== 'http://internal.test/api/products') throw new Error('unexpected fetch ' + url);
  return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(catalogRows)) };
};

// Fresh module per case: clears the 60 s product cache (stripeProducts) and the rate-limit map.
function loadHandler() {
  delete require.cache[HANDLER_PATH];
  return require(HANDLER_PATH);
}

function reset({ now, vaultPromo = true, fail = null, campaignConfig = cappedConfig(), ravenStock = 50, sumiStock = 50 }) {
  fakeNow = now;
  catalogRows = catalog({ vaultPromo, ravenStock, sumiStock });
  failRequest = fail;
  campaignConfigOverride = campaignConfig;
  stripeCalls.create = []; stripeCalls.promoList = 0; stripeCalls.couponRetrieve = 0;
  fetchCalls.length = 0;
  logs = [];
  const handler = loadHandler();
  failRequest = null;
  return handler;
}

async function call(handler, items, extraBody) {
  const req = {
    method: 'POST',
    headers: { origin: 'https://electricink.ie', 'x-real-ip': '10.0.0.1' },
    socket: {},
    body: Object.assign({
      items: items.map(([id, quantity]) => ({ id, quantity, stripe_price_id: 'price_test' })),
      shippingMethod: 'standard',
      shippingAddress: { line1: '1 Test St', city: 'Dublin', postalCode: 'D02', country: 'IE', method: 'standard' }
    }, extraBody || {})
  };
  const res = {
    statusCode: 200, body: undefined, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return res;
}

const amount = () => stripeCalls.create[0].params.amount;
const totals = (res) => res.body.calculatedTotals;
function expectOk(res, cents) {
  assert.strictEqual(res.statusCode, 200, 'status ' + res.statusCode + ' ' + JSON.stringify(res.body));
  assert.strictEqual(stripeCalls.create.length, 1, 'paymentIntents.create calls');
  assert.strictEqual(amount(), cents, 'amount');
}
function expect400(res, message) {
  assert.strictEqual(res.statusCode, 400, 'status ' + res.statusCode);
  assert.deepStrictEqual(res.body, { error: message });
  assert.strictEqual(stripeCalls.create.length, 0, 'paymentIntents.create must not be called');
}
function expectInput400(res, field, messagePart) {
  assert.strictEqual(res.statusCode, 400, 'status ' + res.statusCode);
  assert.strictEqual(res.body.error, 'Invalid request data');
  assert.ok(res.body.details.some((d) => d.field === field && d.message.includes(messagePart)), JSON.stringify(res.body.details));
  assert.strictEqual(stripeCalls.create.length, 0, 'paymentIntents.create must not be called');
}
let passed = 0, total = 0;
async function test(name, fn) {
  total++;
  try { await fn(); passed++; print('PASS ' + name); }
  catch (e) { print('FAIL ' + name + '\n     ' + (e && e.message)); }
}

const RAVEN = 'raven-30', FINE = 'raven-fineline-240', CART = 'cartridge-box-20';

(async () => {
  await test('00 mocks: fetch hits only the simulated /api/products with x-crm-secret', async () => {
    const h = reset({ now: BEFORE });
    const res = await call(h, [[CART, 1]]);
    // 12 + standard shipping 13 = 25 -> 2500
    expectOk(res, 2500);
    assert.strictEqual(fetchCalls.length, 1);
    assert.ok(Object.prototype.hasOwnProperty.call(fetchCalls[0].opts.headers, 'x-crm-secret'));
  });

  await test('01 before the window: normal prices + shipping, VAT included (not added)', async () => {
    let h = reset({ now: BEFORE, vaultPromo: false });
    let res = await call(h, [[RAVEN, 1], [CART, 1]]);
    // 26 + 12 = 38 (VAT already inside the prices); 38 < 150 -> standard 13; total 51 -> 5100
    expectOk(res, 5100);
    // VAT is informational: 38 - 38 / 1.23 = 38 - 30.8943 = 7.1057 -> 7.11
    assert.strictEqual(totals(res).vat, 7.11);
    assert.strictEqual(totals(res).discount, 0);
    assert.strictEqual(totals(res).campaignExtra, 0); assert.strictEqual(totals(res).campaignLabel, '');
    // Promo already on in the CRM but window closed: 4 x 13 + 12 = 64, no Boost; 64 + 13 = 77 -> 7700
    h = reset({ now: BEFORE, vaultPromo: true });
    res = await call(h, [[RAVEN, 4], [CART, 1]]);
    expectOk(res, 7700);
    assert.strictEqual(totals(res).campaignExtra, 0);
  });

  await test('02 window open, Vault only (50% promo), no Boost: no extra', async () => {
    const h = reset({ now: OPEN });
    const res = await call(h, [[RAVEN, 2]]);
    // 2 x 13 = 26; extra 0; 26 + 13 = 39 -> 3900
    expectOk(res, 3900);
    assert.strictEqual(totals(res).campaignExtra, 0); assert.strictEqual(totals(res).campaignLabel, '');
    assert.strictEqual(totals(res).couponCode, '');
  });

  await test('03 window open, Vault + non-Vault 12 >= 10: Boost 60%', async () => {
    const h = reset({ now: OPEN });
    const res = await call(h, [[RAVEN, 2], [CART, 1]]);
    // Boost price = 26 x 40% = 10.40; extra per unit 13 - 10.40 = 2.60; 2 units = 5.20
    // subtotal 26 + 12 = 38 (< 150 -> 13); total 38 - 5.20 + 13 = 45.80 -> 4580
    expectOk(res, 4580);
    assert.strictEqual(totals(res).campaignExtra, 5.2);
    assert.strictEqual(totals(res).discount, 5.2);
    assert.strictEqual(totals(res).campaignLabel, 'BLACKCATFRIDAY');
    assert.strictEqual(stripeCalls.create[0].params.metadata.coupon_code, 'BLACKCATFRIDAY');
    assert.strictEqual(stripeCalls.create[0].params.metadata.discount_amount, '5.20');
  });

  await test('04 uncapped Boost applies 60% to all 6 Vault units', async () => {
    const h = reset({ now: OPEN, campaignConfig: uncappedConfig() });
    const res = await call(h, [[RAVEN, 6], [CART, 1]]);
    // subtotal 6 x 13 + 12 = 90; extra 6 x 2.60 = 15.60; shipping 13 -> total 87.40
    expectOk(res, 8740);
    assert.strictEqual(totals(res).campaignExtra, 15.6);
  });

  await test('05 uncapped Sumi: one complete set costs €100', async () => {
    const h = reset({ now: OPEN, campaignConfig: uncappedConfig() });
    const res = await call(h, SUMI.map((v) => [v, 1]));
    // subtotal 6 x 26 = 156 (>= 150 -> shipping 0); extra 156 - 100 = 56; total 100 -> 10000
    expectOk(res, 10000);
    assert.strictEqual(totals(res).campaignExtra, 56); assert.strictEqual(totals(res).shipping, 0);
  });

  await test('05b uncapped Sumi: two complete sets cost €200', async () => {
    const h = reset({ now: OPEN, campaignConfig: uncappedConfig() });
    const res = await call(h, SUMI.map((v) => [v, 2]));
    // subtotal 12 x 26 = 312 (shipping 0); extra 2 x 56 = 112; total 200 -> 20000
    expectOk(res, 20000);
    assert.strictEqual(totals(res).campaignExtra, 112);
  });

  await test('05c uncapped Sumi: three complete sets cost €300', async () => {
    const h = reset({ now: OPEN, campaignConfig: uncappedConfig() });
    const res = await call(h, SUMI.map((v) => [v, 3]));
    // 3 x €100; subtotal 468, free shipping, discount 168 -> 30000
    expectOk(res, 30000);
    assert.strictEqual(totals(res).campaignExtra, 168);
  });

  await test('05d incomplete Sumi set receives no set price', async () => {
    const h = reset({ now: OPEN });
    const res = await call(h, SUMI.slice(0, 5).map((v) => [v, 1]));
    // Incomplete set: normal subtotal 130 + standard shipping 13, with no kit discount
    expectOk(res, 14300);
    assert.strictEqual(totals(res).campaignExtra, 0);
  });

  await test('06 uncapped Vault accepts quantities above the former per-variant caps', async () => {
    let h = reset({ now: OPEN, campaignConfig: uncappedConfig() });
    let res = await call(h, [[RAVEN, 7], [CART, 1]]);
    // Seven Raven units all receive 60%: 7 x 2.60 extra; 103 subtotal - 18.20 + 13 shipping
    expectOk(res, 9780);
    assert.strictEqual(totals(res).campaignExtra, 18.2);
    h = reset({ now: OPEN, campaignConfig: uncappedConfig() });
    res = await call(h, [[FINE, 4], [CART, 1]]);
    // Four Fineline units all receive 60%: 4 x 4.90 extra; 110 subtotal - 19.60 + 13 shipping
    expectOk(res, 10340);
    assert.strictEqual(totals(res).campaignExtra, 19.6);
  });

  await test('06a integer caps and Boost limit remain backward-compatible', async () => {
    let h = reset({ now: OPEN, campaignConfig: cappedConfig() });
    let res = await call(h, [[RAVEN, 7], [CART, 1]]);
    expect400(res, 'Black Cat Friday deals are limited to 6 per item in each order. Please lower the quantity. Go back to your cart.');
    h = reset({ now: OPEN, campaignConfig: cappedConfig() });
    res = await call(h, [[FINE, 4], [CART, 1]]);
    expect400(res, 'Black Cat Friday deals are limited to 3 per item in each order. Please lower the quantity. Go back to your cart.');
    h = reset({ now: OPEN, campaignConfig: cappedConfig() });
    res = await call(h, [[RAVEN, 6], [CART, 1]]);
    expectOk(res, 9260);
    assert.strictEqual(totals(res).campaignExtra, 10.4);
    h = reset({ now: OPEN, campaignConfig: cappedConfig() });
    res = await call(h, SUMI.map((v) => [v, 3]));
    expect400(res, 'Black Cat Friday set deals are limited to 2 per order. Please lower the quantity. Go back to your cart.');
  });

  await test('06d live config accepts 7 Raven 30 with Boost on all 7 units', async () => {
    const h = reset({ now: OPEN, campaignConfig: CAMPAIGN_CONFIG });
    const res = await call(h, [[RAVEN, 7], [CART, 1]]);
    expectOk(res, 9780);
    assert.strictEqual(totals(res).campaignExtra, 18.2);
  });

  await test('06e live config accepts three complete Sumi sets', async () => {
    const h = reset({ now: OPEN, campaignConfig: CAMPAIGN_CONFIG });
    const res = await call(h, SUMI.map((v) => [v, 3]));
    expectOk(res, 30000);
    assert.strictEqual(totals(res).campaignExtra, 168);
  });

  await test('06b known insufficient stock rejects before PaymentIntent; null stock does not block', async () => {
    let h = reset({ now: OPEN, ravenStock: 2 });
    let res = await call(h, [[RAVEN, 3]]);
    expect400(res, `Only 2 left of raven-black raven-30. Please lower the quantity in your cart.`);
    h = reset({ now: OPEN, ravenStock: null });
    res = await call(h, [[RAVEN, 3]]);
    expectOk(res, 5200);
  });

  await test('06f live config: complete Sumi x3 with known stock below qty on one variant -> 400; null stock does not block', async () => {
    let h = reset({ now: OPEN, campaignConfig: CAMPAIGN_CONFIG, sumiStock: 2 });
    let res = await call(h, SUMI.map((v) => [v, 3]));
    expect400(res, `Only 2 left of sumi sumi-3-jin. Please lower the quantity in your cart.`);
    h = reset({ now: OPEN, campaignConfig: CAMPAIGN_CONFIG, sumiStock: 0 });
    res = await call(h, SUMI.map((v) => [v, 3]));
    expect400(res, 'sumi sumi-3-jin has just sold out. Please remove it from your cart.');
    h = reset({ now: OPEN, campaignConfig: CAMPAIGN_CONFIG, sumiStock: null });
    res = await call(h, SUMI.map((v) => [v, 3]));
    expectOk(res, 30000);
    assert.strictEqual(totals(res).campaignExtra, 168);
  });

  await test('06g live config: Vault STOCK_EXCEEDED rejects before PaymentIntent (stock 2 qty 3; stock 0 sold out)', async () => {
    let h = reset({ now: OPEN, campaignConfig: CAMPAIGN_CONFIG, ravenStock: 2 });
    let res = await call(h, [[RAVEN, 3], [CART, 1]]);
    expect400(res, `Only 2 left of raven-black raven-30. Please lower the quantity in your cart.`);
    h = reset({ now: OPEN, campaignConfig: CAMPAIGN_CONFIG, ravenStock: 0 });
    res = await call(h, [[RAVEN, 1], [CART, 1]]);
    expect400(res, 'raven-black raven-30 has just sold out. Please remove it from your cart.');
  });

  await test('06i violation message names the product and variant, as plain text capped at 80 chars', async () => {
    const h = reset({ now: OPEN, campaignConfig: CAMPAIGN_CONFIG, ravenStock: 2 });
    catalogRows.forEach((r) => { if (r.variant_id === 'raven-30') r.name = '<b>Raven "Black"</b> ' + 'x'.repeat(120); });
    const res = await call(h, [[RAVEN, 3], [CART, 1]]);
    assert.strictEqual(res.statusCode, 400);
    const msg = String((res.body && (res.body.userMessage || res.body.error)) || '');
    assert.ok(/^Only 2 left of b Raven/.test(msg), msg);
    assert.ok(!/[<>"&]/.test(msg), msg);
    assert.ok(msg.length < 140, msg);
  });

  await test('06h repeated lines of the same variant: summed qty counts for stock; 100 limit is per line only', async () => {
    let h = reset({ now: OPEN, campaignConfig: CAMPAIGN_CONFIG, ravenStock: 3 });
    let res = await call(h, [[RAVEN, 2], [RAVEN, 2], [CART, 1]]);
    expect400(res, `Only 3 left of raven-black raven-30. Please lower the quantity in your cart.`);
    // The zod limit (max 100) and the handler check (quantity > 100) run per line, not on the sum.
    h = reset({ now: OPEN, campaignConfig: CAMPAIGN_CONFIG });
    res = await call(h, [[CART, 100], [CART, 100]]);
    expectOk(res, 240000);
  });

  await test('06c technical limits still reject more than 100 units or 50 lines', async () => {
    let h = reset({ now: OPEN });
    let res = await call(h, [[CART, 101]]);
    expectInput400(res, 'items.0.quantity', '100');
    h = reset({ now: OPEN });
    res = await call(h, Array.from({ length: 51 }, () => [CART, 1]));
    expectInput400(res, 'items', '50');
  });

  await test('07 free shipping on the subtotal BEFORE the campaign discount', async () => {
    let h = reset({ now: OPEN, campaignConfig: cappedConfig() });
    let res = await call(h, [[FINE, 3], [RAVEN, 6], [CART, 1]]);
    // subtotal 3 x 24.50 + 6 x 13 + 12 = 73.50 + 78 + 12 = 163.50 (>= 150 -> shipping 0)
    // Boost per unit: Fineline 24.50 - 49 x 40% (19.60) = 4.90; Raven 2.60. Top 4: 3 x 4.90 + 1 x 2.60 = 17.30
    // total 163.50 - 17.30 + 0 = 146.20 (below 150 after discount, still free) -> 14620
    expectOk(res, 14620);
    assert.strictEqual(totals(res).shipping, 0); assert.strictEqual(totals(res).campaignExtra, 17.3);
    h = reset({ now: OPEN, campaignConfig: cappedConfig() });
    res = await call(h, [[FINE, 3], [RAVEN, 4], [CART, 2]]);
    // subtotal 73.50 + 52 + 24 = 149.50 (< 150 -> shipping 13); extra 3 x 4.90 + 1 x 2.60 = 17.30
    // total 149.50 - 17.30 + 13 = 145.20 -> 14520
    expectOk(res, 14520);
    assert.strictEqual(totals(res).shipping, 13);

    h = reset({ now: OPEN, campaignConfig: uncappedConfig() });
    res = await call(h, [[FINE, 3], [RAVEN, 6], [CART, 1]]);
    // All 9 Vault units get Boost: extra 3 x 4.90 + 6 x 2.60 = 30.30; free shipping -> 133.20
    expectOk(res, 13320);
    assert.strictEqual(totals(res).shipping, 0); assert.strictEqual(totals(res).campaignExtra, 30.3);

    h = reset({ now: OPEN, campaignConfig: uncappedConfig() });
    res = await call(h, [[FINE, 3], [RAVEN, 4], [CART, 2]]);
    // All 7 Vault units get Boost: extra 3 x 4.90 + 4 x 2.60 = 25.10; shipping remains €13 -> 137.40
    expectOk(res, 13740);
    assert.strictEqual(totals(res).shipping, 13); assert.strictEqual(totals(res).campaignExtra, 25.1);
  });

  await test('08 coupon with the window open is ignored; Stripe coupon APIs not called', async () => {
    let h = reset({ now: OPEN });
    let res = await call(h, [[RAVEN, 2], [CART, 1]], { couponCode: 'BLACKCAT10', discount: 3.8 });
    // Same as case 03: 38 - 5.20 (campaign only) + 13 = 45.80 -> 4580
    expectOk(res, 4580);
    assert.strictEqual(totals(res).discount, 5.2); assert.strictEqual(totals(res).couponCode, 'BLACKCATFRIDAY');
    assert.strictEqual(stripeCalls.promoList, 0); assert.strictEqual(stripeCalls.couponRetrieve, 0);
    h = reset({ now: OPEN });
    res = await call(h, [[RAVEN, 2]], { couponCode: 'BLACKCAT10', discount: 2.6 });
    // No Boost, coupon ignored: 26 + 13 = 39 -> 3900, discount 0
    expectOk(res, 3900);
    assert.strictEqual(totals(res).discount, 0); assert.strictEqual(totals(res).couponCode, '');
    assert.strictEqual(stripeCalls.promoList, 0); assert.strictEqual(stripeCalls.couponRetrieve, 0);
    // Control (proves the mock is wired): before the window the coupon path runs (1 list, 1 retrieve)
    h = reset({ now: BEFORE });
    res = await call(h, [[RAVEN, 2], [CART, 1]], { couponCode: 'BLACKCAT10', discount: 3.8 });
    // Unknown coupon -> no discount: 2 x 13 + 12 = 38 + 13 = 51 -> 5100
    expectOk(res, 5100);
    assert.strictEqual(stripeCalls.promoList, 1); assert.strictEqual(stripeCalls.couponRetrieve, 1);
  });

  await test('09 campaign fails to load (lib or config): normal prices, no error', async () => {
    for (const fail of ['../lib/campaign', '../campaign.config.json']) {
      const h = reset({ now: OPEN, fail });
      assert.ok(logs.some((l) => l.indexOf('Campaign disabled: failed to load') !== -1), 'load failure logged for ' + fail);
      const res = await call(h, [[RAVEN, 2], [CART, 1]]);
      // No campaign: 2 x 13 + 12 = 38 + 13 = 51 -> 5100
      expectOk(res, 5100);
      assert.strictEqual(totals(res).campaignExtra, 0); assert.strictEqual(totals(res).campaignLabel, '');
    }
  });

  await test('10 metadata: 10 lines split into items + items_2, joined = cart (same order)', async () => {
    const h = reset({ now: OPEN });
    const cart = NEEDLES.map((v, i) => [v, (i % 3) + 1]);
    const res = await call(h, cart);
    // q = 1,2,3,1,2,3,1,2,3,1 -> 19 units x 5 = 95 (< 150 -> 13); no Vault -> extra 0; total 108 -> 10800
    expectOk(res, 10800);
    const md = stripeCalls.create[0].params.metadata;
    // One entry {"id":"needle-cartridge-box-01","v":"needle-cartridge-box-01","q":1} = 6 + 25 + 5 + 25 + 7 = 68 chars
    // n entries: 2 + 68n + (n - 1). n = 7 -> 484 <= 490; n = 8 -> 553 > 490. So items has 7, items_2 has 3.
    assert.ok(typeof md.items === 'string' && typeof md.items_2 === 'string');
    assert.strictEqual(md.items_3, undefined);
    assert.ok(md.items.length <= 490 && md.items_2.length <= 490);
    const a = JSON.parse(md.items), b = JSON.parse(md.items_2);
    assert.strictEqual(a.length, 7); assert.strictEqual(b.length, 3);
    assert.deepStrictEqual(a.concat(b), cart.map(([id, q]) => ({ id, v: id, q })));
  });

  Date.now = realDateNow;
  Module._load = realLoad;
  print(passed + '/' + total + ' passed');
  process.exit(passed === total ? 0 : 1);
})();
