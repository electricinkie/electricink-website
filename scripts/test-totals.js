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
const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'stripe') return stripeFactory;
  if (failRequest && request === failRequest) throw new Error('simulated load failure: ' + request);
  return realLoad.apply(this, arguments);
};

// ── Simulated internal catalog (/api/products rows, prices ex VAT) ──
// loadProducts turns price_ex into gross with parseFloat((ex * 1.23).toFixed(2)),
// so ex = gross / 1.23 gives back exactly the gross written here.
const ex = (gross) => gross / 1.23;
const row = (id, variantId, gross, promoGross) => ({
  id, name: id, category: 'Test', variant_id: variantId, label: variantId,
  price_ex: ex(gross), promo_price_ex: promoGross === undefined ? null : ex(promoGross),
  promo_ends_at: null, stock: 50
});
const SUMI = ['sumi-1-gi', 'sumi-2-yuu', 'sumi-3-jin', 'sumi-4-rei', 'sumi-5-makoto', 'sumi-6-meiyo'];
const NEEDLES = Array.from({ length: 10 }, (_, i) => 'needle-cartridge-box-' + String(i + 1).padStart(2, '0'));
function catalog({ vaultPromo }) {
  return [
    // Vault: Raven 30 list 26, promo 13; Fineline 240 list 49, promo 24.50
    row('raven-black', 'raven-30', 26, vaultPromo ? 13 : undefined),
    row('raven-black-fineline', 'raven-fineline-240', 49, vaultPromo ? 24.5 : undefined),
    // Outside the Vault: 12
    row('cartridge-box', 'cartridge-box-20', 12),
    // Sumi: 6 x 26
    ...SUMI.map((v) => row('sumi', v, 26)),
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

function reset({ now, vaultPromo = true, fail = null }) {
  fakeNow = now;
  catalogRows = catalog({ vaultPromo });
  failRequest = fail;
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

  await test('04 Boost with 6 Vault units: only 4 get 60%', async () => {
    const h = reset({ now: OPEN });
    const res = await call(h, [[RAVEN, 6], [CART, 1]]);
    // subtotal 6 x 13 + 12 = 90; extra 4 x 2.60 = 10.40 (not 6 x 2.60 = 15.60)
    // total 90 - 10.40 + 13 = 92.60 -> 9260
    expectOk(res, 9260);
    assert.strictEqual(totals(res).campaignExtra, 10.4);
  });

  await test('05 Sumi kit: 100 per set; 2 sets ok; 3 sets -> 400 BUNDLE_CAP_EXCEEDED', async () => {
    let h = reset({ now: OPEN });
    let res = await call(h, SUMI.map((v) => [v, 1]));
    // subtotal 6 x 26 = 156 (>= 150 -> shipping 0); extra 156 - 100 = 56; total 100 -> 10000
    expectOk(res, 10000);
    assert.strictEqual(totals(res).campaignExtra, 56); assert.strictEqual(totals(res).shipping, 0);
    h = reset({ now: OPEN });
    res = await call(h, SUMI.map((v) => [v, 2]));
    // subtotal 12 x 26 = 312 (shipping 0); extra 2 x 56 = 112; total 200 -> 20000
    expectOk(res, 20000);
    assert.strictEqual(totals(res).campaignExtra, 112);
    h = reset({ now: OPEN });
    res = await call(h, SUMI.map((v) => [v, 3]));
    // 3 sets > cap 2 -> CAMPAIGN_LIMIT message for BUNDLE_CAP_EXCEEDED with allowed 2
    expect400(res, 'Black Cat Friday set deals are limited to 2 per order. Please lower the quantity. Go back to your cart.');
  });

  await test('06 per-variant cap: 7 x Raven 30 -> 400; 4 x Fineline 240 -> 400', async () => {
    let h = reset({ now: OPEN });
    let res = await call(h, [[RAVEN, 7], [CART, 1]]);
    // cap 6 on raven-30 -> CAP_EXCEEDED allowed 6
    expect400(res, 'Black Cat Friday deals are limited to 6 per item in each order. Please lower the quantity. Go back to your cart.');
    h = reset({ now: OPEN });
    res = await call(h, [[FINE, 4], [CART, 1]]);
    // cap 3 on raven-fineline-240 -> CAP_EXCEEDED allowed 3
    expect400(res, 'Black Cat Friday deals are limited to 3 per item in each order. Please lower the quantity. Go back to your cart.');
  });

  await test('07 free shipping on the subtotal BEFORE the campaign discount', async () => {
    let h = reset({ now: OPEN });
    let res = await call(h, [[FINE, 3], [RAVEN, 6], [CART, 1]]);
    // subtotal 3 x 24.50 + 6 x 13 + 12 = 73.50 + 78 + 12 = 163.50 (>= 150 -> shipping 0)
    // Boost per unit: Fineline 24.50 - 49 x 40% (19.60) = 4.90; Raven 2.60. Top 4: 3 x 4.90 + 1 x 2.60 = 17.30
    // total 163.50 - 17.30 + 0 = 146.20 (below 150 after discount, still free) -> 14620
    expectOk(res, 14620);
    assert.strictEqual(totals(res).shipping, 0); assert.strictEqual(totals(res).campaignExtra, 17.3);
    h = reset({ now: OPEN });
    res = await call(h, [[FINE, 3], [RAVEN, 4], [CART, 2]]);
    // subtotal 73.50 + 52 + 24 = 149.50 (< 150 -> shipping 13); extra 3 x 4.90 + 1 x 2.60 = 17.30
    // total 149.50 - 17.30 + 13 = 145.20 -> 14520
    expectOk(res, 14520);
    assert.strictEqual(totals(res).shipping, 13);
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
