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

// Fixtures (cents, VAT incl.)
const L = {
  raven30:    (qty, o) => Object.assign({ productId: 'raven-black', variantId: 'raven-30', qty, listCents: 2600, paidCents: 1300, promoActive: true, stock: null }, o),
  fine240:    (qty, o) => Object.assign({ productId: 'raven-black-fineline', variantId: 'raven-fineline-240', qty, listCents: 4900, paidCents: 2450, promoActive: true, stock: null }, o),
  cat250:     (qty, o) => Object.assign({ productId: 'cat-slobber', variantId: 'cat-250-clove', qty, listCents: 3000, paidCents: 1500, promoActive: true, stock: null }, o),
  slimer90:   (qty, o) => Object.assign({ productId: 'slimer-gel', variantId: 'slimer-90', qty, listCents: 1400, paidCents: 700, promoActive: true, stock: null }, o),
  transfer30: (qty, o) => Object.assign({ productId: 'transfer-it', variantId: 'transfer-30', qty, listCents: 1100, paidCents: 550, promoActive: true, stock: null }, o),
  cart:       (qty, paid, o) => Object.assign({ productId: 'cartridge-test', variantId: 'cart-box', qty, listCents: paid, paidCents: paid, promoActive: false, stock: null }, o),
};
const run = (lines, o) => C.compute(Object.assign({ config: CONFIG, nowMs: NOW, lines }, o));

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
  const cfg = clone(CONFIG); cfg.enabled = false;
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
  const cfg = clone(CONFIG); cfg.fixedVariants = [{ productId: 'sumi-test', variantId: 'sumi-set' }];
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
test('11 CAP_EXCEEDED: 7x Raven 30 (cap 6); 4x Fineline 240 (cap 3)', () => {
  const r = run([L.raven30(7), L.cart(1, 1800)]);
  assert.deepStrictEqual(r.violations, [{ code: 'CAP_EXCEEDED', productId: 'raven-black', variantId: 'raven-30', allowed: 6, requested: 7 }]);
  assert.strictEqual(r.extraCents, 1040);
  const r2 = run([L.fine240(4), L.cart(1, 1800)]);
  assert.deepStrictEqual(r2.violations, [{ code: 'CAP_EXCEEDED', productId: 'raven-black-fineline', variantId: 'raven-fineline-240', allowed: 3, requested: 4 }]);
  assert.strictEqual(r2.extraCents, 1470);
});
test('12 STOCK_EXCEEDED: stock 2 qty 3; stock null not checked', () => {
  const r = run([L.raven30(3, { stock: 2 }), L.cart(1, 1800)]);
  assert.deepStrictEqual(r.violations, [{ code: 'STOCK_EXCEEDED', productId: 'raven-black', variantId: 'raven-30', allowed: 2, requested: 3 }]);
  assert.strictEqual(r.extraCents, 520);
  const r2 = run([L.raven30(3, { stock: null }), L.cart(1, 1800)]);
  assert.strictEqual(r2.violations.length, 0); assert.strictEqual(r2.extraCents, 780);
});
test('13 max 4 units across lines, highest extra first -> 1500', () => {
  const r = run([L.raven30(3), L.fine240(2), L.cart(1, 1800)]);
  assert.strictEqual(r.boostedUnits, 4); assert.strictEqual(r.extraCents, 1500);
  assert.strictEqual(r.perLine[1].boostedQty, 2); assert.strictEqual(r.perLine[1].extraCents, 980);
  assert.strictEqual(r.perLine[0].boostedQty, 2); assert.strictEqual(r.perLine[0].extraCents, 520);
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
  const cfg = deepFreeze(clone(CONFIG));
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
test('21 validateConfig: accepts real config, rejects bad ones', () => {
  assert.deepStrictEqual(C.validateConfig(CONFIG), { ok: true, errors: [] });
  const muts = [
    (c) => { delete c.label; },
    (c) => { c.vault.discountPercent = 150; },
    (c) => { c.vault.items[0].capPerOrder = -1; },
    (c) => { c.startsAt = 'not a date'; },
    (c) => { c.endsAt = '2026-13-45'; },
    (c) => { c.startsAt = '2026-12-01T00:00:00Z'; },
  ];
  for (const m of muts) { const c = clone(CONFIG); m(c); assert.strictEqual(C.validateConfig(c).ok, false); }
  assert.strictEqual(C.validateConfig(null).ok, false);
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
  const input = { config: CONFIG, nowMs: NOW, lines: [L.raven30(4), L.cart(1, 1800)] };
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
test('26 min qty 3, cap 2 -> sets 2 and BUNDLE_CAP_EXCEEDED', () => {
  const r = run(sumiSet([3, 3, 3, 3, 3, 3]));
  assert.strictEqual(r.bundleSets, 2); assert.strictEqual(r.bundleExtraCents, 2 * SUMI_EXTRA);
  assert.deepStrictEqual(r.violations, [{ code: 'BUNDLE_CAP_EXCEEDED', productId: 'sumi', variantId: null, allowed: 2, requested: 3 }]);
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
  const cfg = clone(CONFIG); cfg.bundles[0].priceCents = 20000;
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
  for (const m of muts) { const c = clone(CONFIG); m(c); assert.strictEqual(C.validateConfig(c).ok, false); }
  const noBundles = clone(CONFIG); delete noBundles.bundles;
  assert.strictEqual(C.validateConfig(noBundles).ok, true);
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
  const cfg = deepFreeze(clone(CONFIG));
  const lines = deepFreeze([L.raven30(2)].concat(sumiSet([3, 2, 2, 2, 2, 2])));
  const before = JSON.stringify({ cfg, lines });
  const a = C.compute({ config: cfg, nowMs: NOW, lines });
  const b = C.compute({ config: cfg, nowMs: NOW, lines });
  assert.strictEqual(a.ok, true); assert.strictEqual(a.bundleSets, 2);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(JSON.stringify({ cfg, lines }), before);
});

console.log(passed + '/' + total + ' passed');
process.exit(passed === total ? 0 : 1);
