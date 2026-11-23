#!/usr/bin/env node
// Tests for lib/campaign.js. Run: node scripts/test-campaign.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'lib', 'campaign.js'));
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'campaign.config.json'), 'utf8'));

const START = Date.parse(CONFIG.startsAt);
const END = Date.parse(CONFIG.endsAt);
const NOW = START + 3600 * 1000;

let passed = 0, total = 0;
function test(name, fn) {
  total++;
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + (e && e.message)); }
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const cappedConfig = () => {
  const cfg = clone(CONFIG);
  cfg.vault.items.forEach((item) => {
    item.capPerOrder = item.productId === 'raven-black-fineline' && item.variantId === 'raven-fineline-240' ? 3 : 6;
  });
  cfg.bundles.forEach((bundle) => { bundle.capPerOrder = 2; });
  cfg.boost.maxUnitsPerOrder = 4;
  return cfg;
};
const uncappedConfig = (nullCaps) => {
  const cfg = clone(CONFIG);
  cfg.vault.items.forEach((item) => { if (nullCaps) item.capPerOrder = null; else delete item.capPerOrder; });
  cfg.bundles.forEach((bundle) => { if (nullCaps) bundle.capPerOrder = null; else delete bundle.capPerOrder; });
  if (nullCaps) cfg.boost.maxUnitsPerOrder = null;
  else delete cfg.boost.maxUnitsPerOrder;
  return cfg;
};
function loadBcfPageHelpers() {
  const pagePath = path.join(ROOT, 'js', 'bcf-page.js');
  const source = fs.readFileSync(pagePath, 'utf8');
  const instrumented = source.replace(/\}\)\(\);\s*$/, 'window.__bcfTest = { boostOf, buildKitItems, boostShort, boostRule };})();');
  assert.notStrictEqual(instrumented, source, 'test hook insertion point');
  const sandbox = {
    window: { cart: { addItem() {}, getCart() { return []; } } },
    document: { readyState: 'loading', addEventListener() {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(instrumented, sandbox);
  return sandbox.window.__bcfTest;
}

function loadDrawerHelpers() {
  const source = fs.readFileSync(path.join(ROOT, 'js', 'cart-drawer.js'), 'utf8');
  const instrumented = source.replace(/\}\)\(\);\s*$/, 'window.__drawerTest = { discountFrom, totalAfterDiscountCents, minusEuros, buildCampaignLines, stockLimit, stockNote };})();');
  assert.notStrictEqual(instrumented, source, 'test hook insertion point');
  const sandbox = { window: { addEventListener() {} }, document: {} };
  vm.createContext(sandbox);
  vm.runInContext(instrumented, sandbox);
  return sandbox.window.__drawerTest;
}

// Fixtures (cents, VAT incl.)
const L = {
  raven30:    (qty, o) => Object.assign({ productId: 'raven-black', variantId: 'raven-30', qty, listCents: 2600, paidCents: 1300, promoActive: true, stock: null }, o),
  fine240:    (qty, o) => Object.assign({ productId: 'raven-black-fineline', variantId: 'raven-fineline-240', qty, listCents: 4900, paidCents: 2450, promoActive: true, stock: null }, o),
  cat250:     (qty, o) => Object.assign({ productId: 'cat-slobber', variantId: 'cat-250-clove', qty, listCents: 3000, paidCents: 1500, promoActive: true, stock: null }, o),
  slimer90:   (qty, o) => Object.assign({ productId: 'slimer-gel', variantId: 'slimer-90', qty, listCents: 1400, paidCents: 700, promoActive: true, stock: null }, o),
  transfer30: (qty, o) => Object.assign({ productId: 'transfer-it', variantId: 'transfer-30', qty, listCents: 1100, paidCents: 550, promoActive: true, stock: null }, o),
  cart:       (qty, paid, o) => Object.assign({ productId: 'cartridge-test', variantId: 'cart-box', qty, listCents: paid, paidCents: paid, promoActive: false, stock: null }, o),
};
const run = (lines, o) => C.compute(Object.assign({ config: cappedConfig(), nowMs: NOW, lines }, o));

test('01 inactive 1 ms before startsAt', () => {
  assert.strictEqual(C.isActive(CONFIG, START - 1), false);
  const r = run([L.raven30(4), L.cart(1, 1800)], { nowMs: START - 1 });
  assert.strictEqual(r.ok, true); assert.strictEqual(r.active, false); assert.strictEqual(r.extraCents, 0);
});
test('02 inactive 1 ms after endsAt', () => {
  assert.strictEqual(C.isActive(CONFIG, END + 1), false);
  const r = run([L.raven30(4), L.cart(1, 1800)], { nowMs: END + 1 });
  assert.strictEqual(r.ok, true); assert.strictEqual(r.extraCents, 0);
});
test('03 enabled false', () => {
  const cfg = cappedConfig(); cfg.enabled = false;
  assert.strictEqual(C.isActive(cfg, NOW), false);
  const r = run([L.raven30(4), L.cart(1, 1800)], { config: cfg });
  assert.strictEqual(r.ok, true); assert.strictEqual(r.active, false); assert.strictEqual(r.extraCents, 0);
});
test('04 active exactly at startsAt and endsAt', () => {
  assert.strictEqual(C.isActive(CONFIG, START), true);
  assert.strictEqual(C.isActive(CONFIG, END), true);
  assert.strictEqual(run([L.raven30(4), L.cart(1, 1800)], { nowMs: START }).extraCents, 1040);
  assert.strictEqual(run([L.raven30(4), L.cart(1, 1800)], { nowMs: END }).extraCents, 1040);
});
test('05 Vault only, no Boost -> extra 0', () => {
  const r = run([L.raven30(4)]);
  assert.strictEqual(r.boostUnlocked, false); assert.strictEqual(r.extraCents, 0);
});
test('06 4x Raven 30 + cartridge 1800 -> 1040', () => {
  const r = run([L.raven30(4), L.cart(1, 1800)]);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.boostUnlocked, true);
  assert.strictEqual(r.extraCents, 1040); assert.strictEqual(r.boostedUnits, 4);
  assert.deepStrictEqual(r.perLine[0], { productId: 'raven-black', variantId: 'raven-30', boostedQty: 4, extraCents: 1040 });
});
test('07 Boost threshold: 1000 unlocks, 999 not, 2x500 unlocks', () => {
  assert.strictEqual(run([L.raven30(1), L.cart(1, 1000)]).boostUnlocked, true);
  assert.strictEqual(run([L.raven30(1), L.cart(1, 999)]).boostUnlocked, false);
  assert.strictEqual(run([L.raven30(1), L.cart(1, 999)]).extraCents, 0);
  const r = run([L.raven30(1), L.cart(2, 500)]);
  assert.strictEqual(r.boostUnlocked, true); assert.strictEqual(r.extraCents, 260);
});
test('08 only Vault lines (another Vault) does not unlock', () => {
  const r = run([L.raven30(2), L.fine240(2), L.cat250(1)]);
  assert.strictEqual(r.boostUnlocked, false); assert.strictEqual(r.extraCents, 0);
});
test('09 fixedVariants: fixed line does not unlock and gets no 60%', () => {
  const cfg = cappedConfig(); cfg.fixedVariants = [{ productId: 'sumi-test', variantId: 'sumi-set' }];
  const fixedLine = { productId: 'sumi-test', variantId: 'sumi-set', qty: 1, listCents: 5000, paidCents: 5000, promoActive: false, stock: null };
  const r = run([L.raven30(4), fixedLine], { config: cfg });
  assert.strictEqual(r.boostUnlocked, false); assert.strictEqual(r.extraCents, 0);
  const r2 = run([L.raven30(1), fixedLine, L.cart(1, 1800)], { config: cfg });
  assert.strictEqual(r2.extraCents, 260);
  assert.strictEqual(r2.perLine[1].extraCents, 0); assert.strictEqual(r2.perLine[1].boostedQty, 0);
});
test('10 promoActive false on Vault line -> no extra, no cap check', () => {
  const r = run([L.raven30(9, { promoActive: false, paidCents: 2600, stock: 1 }), L.fine240(1), L.cart(1, 1800)]);
  assert.strictEqual(r.violations.length, 0);
  assert.strictEqual(r.perLine[0].extraCents, 0);
  assert.strictEqual(r.extraCents, 490);
});
test('11 absent/null caps mean unlimited Vault quantity and Boost units', () => {
  for (const cfg of [uncappedConfig(false), uncappedConfig(true)]) {
    assert.deepStrictEqual(C.validateConfig(cfg), { ok: true, errors: [] });
    const six = run([L.raven30(6), L.cart(1, 1800)], { config: cfg });
    assert.strictEqual(six.boostedUnits, 6); assert.strictEqual(six.extraCents, 1560);
    const r = run([L.raven30(7), L.cart(1, 1800)], { config: cfg });
    assert.deepStrictEqual(r.violations, []);
    assert.strictEqual(r.boostedUnits, 7); assert.strictEqual(r.extraCents, 1820);
    const r2 = run([L.fine240(4), L.cart(1, 1800)], { config: cfg });
    assert.deepStrictEqual(r2.violations, []);
    assert.strictEqual(r2.boostedUnits, 4); assert.strictEqual(r2.extraCents, 1960);
  }
});
test('12 STOCK_EXCEEDED: stock 2 qty 3; stock null not checked', () => {
  const r = run([L.raven30(3, { stock: 2 }), L.cart(1, 1800)], { config: cappedConfig() });
  assert.deepStrictEqual(r.violations, [{ code: 'STOCK_EXCEEDED', productId: 'raven-black', variantId: 'raven-30', allowed: 2, requested: 3 }]);
  assert.strictEqual(r.extraCents, 520);
  const r2 = run([L.raven30(3, { stock: null }), L.cart(1, 1800)]);
  assert.strictEqual(r2.violations.length, 0); assert.strictEqual(r2.extraCents, 780);
});
test('12a real config accepts 7 Raven 30 with Boost on all 7 units', () => {
  const r = run([L.raven30(7), L.cart(1, 1800)], { config: CONFIG });
  assert.deepStrictEqual(r.violations, []);
  assert.strictEqual(r.boostedUnits, 7); assert.strictEqual(r.extraCents, 1820);
});
test('12b real config accepts three complete Sumi sets', () => {
  const lines = CONFIG.bundles[0].variantIds.map((variantId) => ({
    productId: 'sumi', variantId, qty: 3, listCents: 2600, paidCents: 2600, promoActive: false, stock: null
  }));
  const r = run(lines, { config: CONFIG });
  assert.strictEqual(r.bundleSets, 3);
  assert.strictEqual(r.extraCents, 16800);
  assert.deepStrictEqual(r.violations, []);
});
test('13 integer legacy caps remain enforced, including Boost max units', () => {
  const config = cappedConfig();
  const r = run([L.raven30(7), L.cart(1, 1800)], { config });
  assert.deepStrictEqual(r.violations, [{ code: 'CAP_EXCEEDED', productId: 'raven-black', variantId: 'raven-30', allowed: 6, requested: 7 }]);
  assert.strictEqual(r.boostedUnits, 4); assert.strictEqual(r.extraCents, 1040);
  const r2 = run([L.fine240(4), L.cart(1, 1800)], { config });
  assert.deepStrictEqual(r2.violations, [{ code: 'CAP_EXCEEDED', productId: 'raven-black-fineline', variantId: 'raven-fineline-240', allowed: 3, requested: 4 }]);
  assert.strictEqual(r2.boostedUnits, 3); assert.strictEqual(r2.extraCents, 1470);
  const r3 = run([L.raven30(6), L.cart(1, 1800)], { config });
  assert.strictEqual(r3.boostedUnits, 4); assert.strictEqual(r3.extraCents, 1040);
});
test('13a explicit maxUnitsPerOrder zero keeps the Boost disabled', () => {
  const cfg = cappedConfig(); cfg.boost.maxUnitsPerOrder = 0;
  assert.strictEqual(C.validateConfig(cfg).ok, true);
  const r = run([L.raven30(6), L.cart(1, 1800)], { config: cfg });
  assert.strictEqual(r.boostedUnits, 0); assert.strictEqual(r.extraCents, 0);
});
test('14 rounding: 1100/550 -> 110; 999/500 -> boost 400, extra 100', () => {
  assert.strictEqual(run([L.transfer30(1), L.cart(1, 1800)]).extraCents, 110);
  const odd = { productId: 'raven-black', variantId: 'raven-30', qty: 1, listCents: 999, paidCents: 500, promoActive: true, stock: null };
  assert.strictEqual(run([odd, L.cart(1, 1800)]).extraCents, 100);
  assert.strictEqual(run([L.slimer90(1), L.cat250(1), L.cart(1, 1800)]).extraCents, 440);
});
test('15 paidCents below Boost price -> extra 0', () => {
  const r = run([L.raven30(2, { paidCents: 900 }), L.cart(1, 1800)]);
  assert.strictEqual(r.extraCents, 0); assert.strictEqual(r.boostedUnits, 0);
});
test('16 invalid inputs -> ok false, extra 0, no throw', () => {
  const bad = [
    null,
    [L.raven30('2')],
    [L.raven30(-1)],
    [L.raven30(1.5)],
    [L.raven30(1, { paidCents: NaN })],
    [L.raven30(1, { listCents: 12.5 })],
  ];
  for (const lines of bad) {
    const r = run(lines);
    assert.strictEqual(r.ok, false); assert.strictEqual(r.extraCents, 0);
    assert.strictEqual(r.active, false); assert.strictEqual(r.error, 'INVALID_INPUT');
  }
  assert.strictEqual(C.compute(undefined).error, 'INVALID_INPUT');
  assert.strictEqual(run([L.raven30(1)], { config: { enabled: true } }).error, 'INVALID_INPUT');
});
test('17 empty lines -> extra 0', () => {
  const r = run([]);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.extraCents, 0);
});
test('18 fuzz 300 random inputs (fixed seed)', () => {
  let seed = 0xBCF2026;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const weird = [0, -1, 1.5, NaN, Infinity, '3', null, undefined, {}, [], true, 1e9];
  const pairs = CONFIG.vault.items.map((i) => [i.productId, i.variantId]).concat([['x', 'y'], ['cartridge-test', 'cart-box']]);
  for (let n = 0; n < 300; n++) {
    const lines = [];
    const count = Math.floor(rnd() * 8);
    for (let i = 0; i < count; i++) {
      const [p, v] = pick(pairs);
      const g = () => (rnd() < 0.1 ? pick(weird) : Math.floor(rnd() * 6000));
      lines.push({ productId: p, variantId: v, qty: rnd() < 0.1 ? pick(weird) : 1 + Math.floor(rnd() * 8),
        listCents: g(), paidCents: g(), promoActive: rnd() < 0.8, stock: rnd() < 0.5 ? null : Math.floor(rnd() * 6) });
    }
    const input = rnd() < 0.05 ? pick(weird) : lines;
    let r;
    assert.doesNotThrow(() => { r = run(input, { nowMs: START + Math.floor(rnd() * (END - START)) }); });
    assert.ok(Number.isInteger(r.extraCents) && r.extraCents >= 0, 'extraCents ' + r.extraCents);
    if (r.ok && Array.isArray(input)) {
      const vaultPaid = input.reduce((s, l) => s + l.paidCents * l.qty, 0);
      assert.ok(r.extraCents <= vaultPaid);
    }
  }
});
test('19 purity: deep-frozen inputs do not throw and do not change', () => {
  const deepFreeze = (o) => { Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };
  const cfg = deepFreeze(cappedConfig());
  const lines = deepFreeze([L.raven30(5, { stock: 3 }), L.fine240(2), L.cart(1, 1800)]);
  const before = JSON.stringify({ cfg, lines });
  const r = C.compute({ config: cfg, nowMs: NOW, lines });
  assert.strictEqual(r.ok, true); assert.strictEqual(r.error, null);
  assert.strictEqual(JSON.stringify({ cfg, lines }), before);
});
test('20 determinism: same call twice, same result', () => {
  const lines = [L.raven30(3), L.fine240(2), L.cat250(4), L.cart(1, 1800)];
  assert.deepStrictEqual(run(lines), run(lines));
});
test('21 validateConfig: accepts explicit capped config, rejects bad ones', () => {
  assert.deepStrictEqual(C.validateConfig(cappedConfig()), { ok: true, errors: [] });
  const muts = [
    (c) => { delete c.label; },
    (c) => { c.vault.discountPercent = 150; },
    (c) => { c.vault.items[0].capPerOrder = -1; },
    (c) => { c.startsAt = 'not a date'; },
    (c) => { c.endsAt = '2026-13-45'; },
    (c) => { c.startsAt = '2026-12-01T00:00:00Z'; },
  ];
  for (const m of muts) { const c = cappedConfig(); m(c); assert.strictEqual(C.validateConfig(c).ok, false); }
  assert.strictEqual(C.validateConfig(null).ok, false);
});
test('21a validateConfig rejects every invalid Vault, bundle and Boost cap value', () => {
  for (const value of [-1, 1.5, '6']) {
    const vaultCap = cappedConfig();
    vaultCap.vault.items[0].capPerOrder = value;
    assert.strictEqual(C.validateConfig(vaultCap).ok, false, 'Vault cap ' + JSON.stringify(value));

    const bundleCap = cappedConfig();
    bundleCap.bundles[0].capPerOrder = value;
    assert.strictEqual(C.validateConfig(bundleCap).ok, false, 'bundle cap ' + JSON.stringify(value));

    const boostCap = cappedConfig();
    boostCap.boost.maxUnitsPerOrder = value;
    assert.strictEqual(C.validateConfig(boostCap).ok, false, 'Boost cap ' + JSON.stringify(value));
  }
});
test('21b partial Vault caps keep the one explicit cap and leave other variants uncapped', () => {
  const cfg = clone(CONFIG);
  cfg.vault.items.forEach((item) => {
    if (item.productId === 'raven-black' && item.variantId === 'raven-30') item.capPerOrder = 6;
    else delete item.capPerOrder;
  });
  cfg.bundles.forEach((bundle) => { bundle.capPerOrder = 2; });
  cfg.boost.maxUnitsPerOrder = 4;

  assert.deepStrictEqual(C.validateConfig(cfg), { ok: true, errors: [] });
  const r = run([L.raven30(7), L.cart(1, 1800)], { config: cfg });
  assert.deepStrictEqual(r.violations, [{ code: 'CAP_EXCEEDED', productId: 'raven-black', variantId: 'raven-30', allowed: 6, requested: 7 }]);
  const other = run([L.fine240(4), L.cart(1, 1800)], { config: cfg });
  assert.deepStrictEqual(other.violations, []);
  assert.strictEqual(other.boostedUnits, 4); assert.strictEqual(other.extraCents, 1960);
});
test('22 integration: every Vault/fixed pair exists in data/*.json', () => {
  const dir = path.join(ROOT, 'data');
  const catalog = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    Object.assign(catalog, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  }
  const pairs = CONFIG.vault.items.concat(CONFIG.fixedVariants);
  for (const { productId, variantId } of pairs) {
    const p = catalog[productId];
    assert.ok(p && typeof p === 'object', 'missing product ' + productId);
    assert.ok(Array.isArray(p.variants) && p.variants.some((v) => v && v.id === variantId), 'missing variant ' + productId + '/' + variantId);
  }
});
test('23 UMD: require exposes compute; window.EI_CAMPAIGN in vm', () => {
  assert.strictEqual(typeof C.compute, 'function');
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'campaign.js'), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  assert.strictEqual(typeof sandbox.window.EI_CAMPAIGN.compute, 'function');
  const input = { config: cappedConfig(), nowMs: NOW, lines: [L.raven30(4), L.cart(1, 1800)] };
  const a = JSON.parse(JSON.stringify(sandbox.window.EI_CAMPAIGN.compute(input)));
  assert.deepStrictEqual(a, C.compute(input));
  assert.strictEqual(a.extraCents, 1040);
});

// ── Bundle (Sumi set) ──
const SUMI = CONFIG.bundles[0].variantIds;
const sumi = (variantId, qty, o) => Object.assign({ productId: 'sumi', variantId, qty, listCents: 2600, paidCents: 2600, promoActive: false, stock: null }, o);
const sumiSet = (qtys) => SUMI.map((v, i) => sumi(v, qtys ? qtys[i] : 1));
const SUMI_EXTRA = 6 * 2600 - CONFIG.bundles[0].priceCents;

test('24 full Sumi set, 1 set (6 x 2600) -> bundleExtra 6 x 2600 - priceCents', () => {
  const r = run(sumiSet());
  assert.strictEqual(r.ok, true); assert.strictEqual(r.bundleSets, 1);
  assert.strictEqual(r.bundleExtraCents, SUMI_EXTRA); assert.strictEqual(r.extraCents, SUMI_EXTRA);
  assert.deepStrictEqual(r.perBundle, [{ id: 'sumi-set', sets: 1, extraCents: SUMI_EXTRA }]);
});
test('25 one of the 6 variants missing -> bundleExtra 0', () => {
  const r = run(sumiSet().slice(0, 5));
  assert.strictEqual(r.bundleSets, 0); assert.strictEqual(r.bundleExtraCents, 0); assert.strictEqual(r.extraCents, 0);
});
test('26 three Sumi sets accepted at the configured set price when cap is absent/null', () => {
  for (const cfg of [uncappedConfig(false), uncappedConfig(true)]) {
    const r = run(sumiSet([3, 3, 3, 3, 3, 3]), { config: cfg });
    assert.strictEqual(r.bundleSets, 3); assert.strictEqual(r.bundleExtraCents, 3 * SUMI_EXTRA);
    assert.strictEqual(r.extraCents, 16800); // three sets, each discounted from €156 to €100
    assert.deepStrictEqual(r.violations, []);
  }
});
test('27 qty (2,1,1,1,1,1) -> 1 set', () => {
  const r = run(sumiSet([2, 1, 1, 1, 1, 1]));
  assert.strictEqual(r.bundleSets, 1); assert.strictEqual(r.bundleExtraCents, SUMI_EXTRA); assert.strictEqual(r.violations.length, 0);
});
test('28 set + Vault (Raven 30): set unlocks Boost, total = bundle + Vault extra', () => {
  const r = run([L.raven30(4)].concat(sumiSet()));
  assert.strictEqual(r.boostUnlocked, true);
  assert.strictEqual(r.bundleExtraCents, SUMI_EXTRA);
  assert.strictEqual(r.perLine[0].extraCents, 1040);
  assert.strictEqual(r.extraCents, SUMI_EXTRA + 1040);
});
test('29 priceCents above the sum of the 6 -> bundleExtra 0 (never negative)', () => {
  const cfg = cappedConfig(); cfg.bundles[0].priceCents = 20000;
  const r = run(sumiSet(), { config: cfg });
  assert.strictEqual(r.bundleSets, 1); assert.strictEqual(r.bundleExtraCents, 0); assert.strictEqual(r.extraCents, 0);
});
test('30 validateConfig rejects invalid bundles', () => {
  const muts = [
    (c) => { delete c.bundles[0].id; },
    (c) => { c.bundles[0].priceCents = 0; },
    (c) => { c.bundles[0].variantIds = []; },
    (c) => { c.bundles[0].capPerOrder = 0; },
    (c) => { c.bundles = {}; },
    (c) => { c.vault.items.push({ productId: 'sumi', variantId: 'sumi-1-gi', capPerOrder: 6 }); },
  ];
  for (const m of muts) { const c = cappedConfig(); m(c); assert.strictEqual(C.validateConfig(c).ok, false); }
  const noBundles = cappedConfig(); delete noBundles.bundles;
  assert.strictEqual(C.validateConfig(noBundles).ok, true);
});

test('34 bcf-page boostOf accepts missing maxUnitsPerOrder as uncapped', () => {
  const helpers = loadBcfPageHelpers();
  const boost = { discountPercent: 60, minLineCents: 1000 };
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(helpers.boostOf({ enabled: true, boost }))),
    boost
  );
});
test('34a bcf-page boostOf accepts an explicit maxUnitsPerOrder', () => {
  const helpers = loadBcfPageHelpers();
  const boost = { discountPercent: 60, minLineCents: 1000, maxUnitsPerOrder: 4 };
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(helpers.boostOf({ enabled: true, boost }))),
    boost
  );
});
test('35 bcf-page buildKitItems accepts a bundle without capPerOrder', () => {
  const helpers = loadBcfPageHelpers();
  const bundle = { productId: 'sumi', variantIds: SUMI };
  const rows = SUMI.map((variant_id) => ({ id: 'sumi', variant_id, effective_price_ex: 1 / 1.23, stock: 5 }));
  const local = {
    name: 'Sumi',
    variants: SUMI.map((id) => ({ id, label: id, stripe_price_id: 'price_' + id }))
  };
  const items = helpers.buildKitItems(bundle, rows, local);
  assert.ok(Array.isArray(items), 'buildKitItems should accept a bundle without capPerOrder');
  assert.strictEqual(items.length, 6);
  assert.strictEqual(items[0].price, 1);
});
test('35a bcf-page buildKitItems accepts a bundle with capPerOrder', () => {
  const helpers = loadBcfPageHelpers();
  const bundle = { productId: 'sumi', variantIds: SUMI, capPerOrder: 2 };
  const rows = SUMI.map((variant_id) => ({ id: 'sumi', variant_id, effective_price_ex: 1 / 1.23, stock: 5 }));
  const local = {
    name: 'Sumi',
    variants: SUMI.map((id) => ({ id, label: id, stripe_price_id: 'price_' + id }))
  };
  const items = helpers.buildKitItems(bundle, rows, local);
  assert.ok(Array.isArray(items), 'buildKitItems should accept a bundle with capPerOrder');
  assert.strictEqual(items.length, 6);
  assert.strictEqual(items[0].price, 1);
});
test('31 integration: the 6 bundle variantIds exist in data/products-artistic-inks.json', () => {
  const inks = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'products-artistic-inks.json'), 'utf8'));
  for (const b of CONFIG.bundles) {
    const p = inks[b.productId];
    assert.ok(p && Array.isArray(p.variants), 'missing product ' + b.productId);
    for (const v of b.variantIds) assert.ok(p.variants.some((x) => x && x.id === v), 'missing variant ' + v);
  }
});
test('32 fuzz 300 inputs with the bundle active (fixed seed)', () => {
  let seed = 0x5041;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const weird = [0, -1, 1.5, NaN, '3', null, undefined, {}, 1e9];
  const pairs = SUMI.map((v) => ['sumi', v]).concat(CONFIG.vault.items.map((i) => [i.productId, i.variantId]), [['cartridge-test', 'cart-box']]);
  for (let n = 0; n < 300; n++) {
    const lines = [];
    const count = Math.floor(rnd() * 12);
    for (let i = 0; i < count; i++) {
      const [p, v] = pick(pairs);
      const g = () => (rnd() < 0.1 ? pick(weird) : Math.floor(rnd() * 6000));
      lines.push({ productId: p, variantId: v, qty: rnd() < 0.1 ? pick(weird) : 1 + Math.floor(rnd() * 4),
        listCents: g(), paidCents: g(), promoActive: rnd() < 0.7, stock: rnd() < 0.5 ? null : Math.floor(rnd() * 6) });
    }
    let r;
    assert.doesNotThrow(() => { r = run(lines); });
    assert.ok(Number.isInteger(r.extraCents) && r.extraCents >= 0, 'extraCents ' + r.extraCents);
    assert.ok(Number.isInteger(r.bundleExtraCents) && r.bundleExtraCents >= 0);
    if (r.ok) assert.ok(r.extraCents <= lines.reduce((s, l) => s + l.paidCents * l.qty, 0));
  }
});
test('33 purity and determinism with the bundle (frozen objects)', () => {
  const deepFreeze = (o) => { Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };
  const cfg = deepFreeze(cappedConfig());
  const lines = deepFreeze([L.raven30(2)].concat(sumiSet([3, 2, 2, 2, 2, 2])));
  const before = JSON.stringify({ cfg, lines });
  const a = C.compute({ config: cfg, nowMs: NOW, lines });
  const b = C.compute({ config: cfg, nowMs: NOW, lines });
  assert.strictEqual(a.ok, true); assert.strictEqual(a.bundleSets, 2);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(JSON.stringify({ cfg, lines }), before);
});

test('36 Sumi stock known below qty -> STOCK_EXCEEDED with allowed/requested; null stock -> none', () => {
  const stocked = (stock) => SUMI.map((v, i) => sumi(v, 3, { stock: i === 2 ? stock : null }));
  const r = run(stocked(2), { config: CONFIG });
  assert.deepStrictEqual(r.violations, [{ code: 'STOCK_EXCEEDED', productId: 'sumi', variantId: SUMI[2], allowed: 2, requested: 3 }]);
  const r0 = run(stocked(0), { config: CONFIG });
  assert.deepStrictEqual(r0.violations, [{ code: 'STOCK_EXCEEDED', productId: 'sumi', variantId: SUMI[2], allowed: 0, requested: 3 }]);
  assert.deepStrictEqual(run(stocked(null), { config: CONFIG }).violations, []);
  assert.deepStrictEqual(run(stocked(3), { config: CONFIG }).violations, []);
});
test('36a Sumi repeated lines of one variant: summed qty vs the lowest known stock, one violation', () => {
  const lines = sumiSet().concat([sumi(SUMI[0], 2, { stock: 5 })]);
  lines[0] = sumi(SUMI[0], 2, { stock: 3 });
  const r = run(lines, { config: CONFIG });
  assert.deepStrictEqual(r.violations, [{ code: 'STOCK_EXCEEDED', productId: 'sumi', variantId: SUMI[0], allowed: 3, requested: 4 }]);
});
test('37 explicit maxUnitsPerOrder 0: boostUnlocked false and extra 0 even with the threshold met', () => {
  const cfg = cappedConfig(); cfg.boost.maxUnitsPerOrder = 0;
  const r = run([L.raven30(6), L.cart(1, 1800)], { config: cfg });
  assert.strictEqual(r.boostUnlocked, false); assert.strictEqual(r.boostedUnits, 0); assert.strictEqual(r.extraCents, 0);
});
test('37a bcf-page boostOf returns null for an explicit maxUnitsPerOrder 0', () => {
  const helpers = loadBcfPageHelpers();
  assert.strictEqual(helpers.boostOf({ enabled: true, boost: { discountPercent: 60, minLineCents: 1000, maxUnitsPerOrder: 0 } }), null);
});


// ── Cart and drawer: total with the Black Cat Friday line (display only) ──
test('38 drawer: discountFrom shows the extra only without violations, with fresh prices and a positive integer', () => {
  const { discountFrom } = loadDrawerHelpers();
  const ok = { ok: true, active: true, violations: [], extraCents: 1680 };
  assert.strictEqual(discountFrom(ok, true), 1680);
  assert.strictEqual(discountFrom(ok, false), 0);
  assert.strictEqual(discountFrom(Object.assign({}, ok, { violations: [{ code: 'STOCK_EXCEEDED' }] }), true), 0);
  assert.strictEqual(discountFrom(Object.assign({}, ok, { active: false }), true), 0);
  assert.strictEqual(discountFrom(Object.assign({}, ok, { ok: false }), true), 0);
  assert.strictEqual(discountFrom(Object.assign({}, ok, { extraCents: 0 }), true), 0);
  assert.strictEqual(discountFrom(Object.assign({}, ok, { extraCents: 10.5 }), true), 0);
  assert.strictEqual(discountFrom(null, true), 0);
});
test('39 drawer: totalAfterDiscountCents subtracts, and ignores a discount above the subtotal or a bad number', () => {
  const { totalAfterDiscountCents, minusEuros } = loadDrawerHelpers();
  assert.strictEqual(totalAfterDiscountCents(46800, 16800), 30000);
  assert.strictEqual(totalAfterDiscountCents(11800, 2080), 9720);
  assert.strictEqual(totalAfterDiscountCents(1000, 0), 1000);
  assert.strictEqual(totalAfterDiscountCents(1000, 1001), 1000);
  assert.strictEqual(totalAfterDiscountCents(1000, NaN), 1000);
  assert.strictEqual(minusEuros(16800), '\u2212\u20ac168.00');
});
test('40 drawer: 3 Sumi sets in the cart -> discount 16800, total 30000 (same as the checkout)', () => {
  const { buildCampaignLines, discountFrom, totalAfterDiscountCents } = loadDrawerHelpers();
  const rows = SUMI.map((v) => ({ id: 'sumi', variant_id: v, price_ex: '21.14', effective_price_ex: '21.14', promo_active: false, stock: null }));
  const cart = SUMI.map((v) => ({ id: 'sumi-' + v, price: 26, quantity: 3 }));
  const built = buildCampaignLines(cart, rows);
  assert.strictEqual(built.priceOk, true);
  const r = C.compute({ config: CONFIG, nowMs: NOW, lines: built.lines });
  assert.strictEqual(r.violations.length, 0);
  const d = discountFrom(r, built.priceOk);
  assert.strictEqual(d, 3 * SUMI_EXTRA);
  assert.strictEqual(totalAfterDiscountCents(46800, d), 46800 - d);
  // a stale price in the cart switches the display off
  cart[0].price = 25;
  assert.strictEqual(discountFrom(r, buildCampaignLines(cart, rows).priceOk), 0);
});


// ── Category card: "from" price with the promo of the cheapest variant ──
function loadCategoryHelper() {
  const source = fs.readFileSync(path.join(ROOT, 'js', 'category-page.js'), 'utf8');
  const m = source.match(/function variantPromoDisplay\(variants\) \{[\s\S]*?\n\}\n/);
  assert.ok(m, 'variantPromoDisplay found');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(m[0] + ';this.fn = variantPromoDisplay;', sandbox);
  return sandbox.fn;
}
test('41 category: cheapest variant on promo -> was/now/from with the SAME variant\'s normal price', () => {
  const f = loadCategoryHelper();
  const out = f([{ price: 24.5, wasPrice: 49 }, { price: 13, wasPrice: 26 }]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(out)), { was: '\u20ac26.00', now: '\u20ac13.00', from: true });
});
test('42 category: no promo, cheapest not on promo, bad or missing data -> null (card stays "from")', () => {
  const f = loadCategoryHelper();
  assert.strictEqual(f([{ price: 13 }, { price: 24.5, wasPrice: 49 }]), null);
  assert.strictEqual(f([{ price: 13, wasPrice: 13 }]), null);
  assert.strictEqual(f([{ price: 13, wasPrice: 'x' }]), null);
  assert.strictEqual(f([{ price: NaN, wasPrice: 20 }]), null);
  assert.strictEqual(f([]), null);
  assert.strictEqual(f(undefined), null);
  assert.strictEqual(f([null, { price: 5, wasPrice: 10 }]).now, '\u20ac5.00');
});
test('43 category: the badge maths in the card gives -50% for from 13.00 / was 26.00', () => {
  const f = loadCategoryHelper();
  const d = f([{ price: 13, wasPrice: 26 }]);
  const off = Math.round((1 - parseFloat(d.now.replace(/[^0-9.]/g, '')) / parseFloat(d.was.replace(/[^0-9.]/g, ''))) * 100);
  assert.strictEqual(off, 50);
});


// ── Black Cat Friday page copy: short line in the text, exact rule in the small print ──
test('44 bcf-page: boostShort is plain and short; boostRule keeps the exact rule (sale price x quantity)', () => {
  const h = loadBcfPageHelpers();
  const boost = { discountPercent: 60, minLineCents: 1000 };
  assert.strictEqual(h.boostShort(boost), 'Add any other product worth \u20ac10+ and your Vault items drop to 60%.');
  assert.ok(h.boostShort(boost).indexOf('sale price') === -1);
  assert.ok(h.boostRule(boost).indexOf('one product outside the Vault comes to \u20ac10 or more') !== -1);
  assert.ok(h.boostRule(boost).indexOf('(sale price x quantity)') !== -1);
  // the rule still matches lib/campaign.js: ONE non-Vault line, paid x qty >= minLineCents (10.00 exactly unlocks)
  assert.strictEqual(run([L.raven30(2), L.cart(1, 1000)]).boostUnlocked, true);
  assert.strictEqual(run([L.raven30(2), L.cart(1, 999)]).boostUnlocked, false);
  assert.strictEqual(run([L.raven30(2), L.cart(1, 500, { variantId: 'a' }), L.cart(1, 500, { variantId: 'b' })]).boostUnlocked, false);
});


// ── Stock hints on the "+" (comfort only; the server still rejects) ──
test('45 drawer/cart: stockLimit keeps whole numbers; null, empty and junk are unknown (never block)', () => {
  const { stockLimit } = loadDrawerHelpers();
  assert.strictEqual(stockLimit(5), 5); assert.strictEqual(stockLimit('3'), 3); assert.strictEqual(stockLimit(0), 0);
  assert.strictEqual(stockLimit(-2), 0);
  [null, undefined, '', 'abc', 2.5, NaN].forEach((v) => assert.strictEqual(stockLimit(v), null, String(v)));
});
test('46 drawer/cart: stockNote clamps at the stock; null limit never blocks; 0 says Out of stock', () => {
  const { stockNote } = loadDrawerHelpers();
  assert.strictEqual(stockNote(3, 2), '');
  assert.strictEqual(stockNote(3, 3), 'Only 3 left');
  assert.strictEqual(stockNote(3, 4), 'Only 3 left');
  assert.strictEqual(stockNote(0, 1), 'Out of stock');
  assert.strictEqual(stockNote(null, 99), '');
  assert.strictEqual(stockNote(undefined, 99), '');
  assert.strictEqual(stockNote(3, undefined), '');
});
test('47 product page: cartStockNote same rule (null/empty/junk never block; N in cart of N -> Only N left)', () => {
  const source = fs.readFileSync(path.join(ROOT, 'js', 'product-page.js'), 'utf8');
  const m = source.match(/function cartStockNote\(stock, inCart\) \{[\s\S]*?\n\}\n/);
  assert.ok(m, 'cartStockNote found');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(m[0] + ';this.fn = cartStockNote;', sandbox);
  const f = sandbox.fn;
  assert.strictEqual(f(4, 3), ''); assert.strictEqual(f(4, 4), 'Only 4 left'); assert.strictEqual(f(0, 0), 'Out of stock');
  [null, undefined, '', 'x', 1.5, -1].forEach((v) => assert.strictEqual(f(v, 9), '', String(v)));
});

console.log(passed + '/' + total + ' passed');
process.exit(passed === total ? 0 : 1);
