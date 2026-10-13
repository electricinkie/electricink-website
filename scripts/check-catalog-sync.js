#!/usr/bin/env node
'use strict';

// ============================================================
// check-catalog-sync.js
// Run: node scripts/check-catalog-sync.js [--url https://electricink.ie/api/catalog?type=products]
// Read-only: reads data/*.json and does a public GET to the catalog.
// No external dependencies — only Node.js built-ins.
// Exit codes: 0 = no errors, 1 = errors found, 2 = catalog fetch failed.
// ============================================================

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_URL = 'https://electricink.ie/api/catalog?type=products';
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const IGNORED_FILES = new Set(['category-messages.json']);

// Catalog-only entries already known and accepted (warning g)
const EXPECTED_CATALOG_ONLY = new Set([
  'rmg-030-super-8',
  'rl-022-07',
  'rl-022-09',
  'rl-022-11',
  'combo-nano-pen-deluxe-montaghini',
  'grip-flat-crystal-mg05-closed-30mm-20un'
]);

// Wholesale tiers known not to resolve in the internal (check f → warning)
const KNOWN_UNRESOLVED_PREFIX = 'balm-wholesale-';

function parseUrlArg(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url' && argv[i + 1]) return argv[i + 1];
    if (argv[i].startsWith('--url=')) return argv[i].slice('--url='.length);
  }
  return DEFAULT_URL;
}

const CATALOG_URL = parseUrlArg(process.argv.slice(2));

const errors = [];
const warnings = [];

// ────────── Output helpers ──────────

function error(check, msg) {
  errors.push(`ERROR [${check}] ${msg}`);
}

function warn(check, msg) {
  warnings.push(`WARN  [${check}] ${msg}`);
}

// ────────── HTTP helper ──────────

function request(urlStr) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlStr);
    } catch (e) {
      return reject(new Error(`Invalid URL: ${urlStr}`));
    }

    const lib = url.protocol === 'https:' ? https : http;

    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'User-Agent': 'electricink-catalog-sync/1.0', 'Accept': 'application/json' },
      timeout: 20000,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out after 20s'));
    });
    req.end();
  });
}

// ────────── Data loading ──────────

function loadSiteProducts() {
  const products = [];
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json') && !IGNORED_FILES.has(f));
  for (const file of files) {
    const obj = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
    for (const [pid, product] of Object.entries(obj)) {
      if (product && typeof product === 'object') products.push({ file, pid, product });
    }
  }
  return products;
}

async function loadCatalog() {
  const res = await request(CATALOG_URL);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  let rows;
  try {
    rows = JSON.parse(res.body);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e.message}`);
  }
  if (!Array.isArray(rows)) throw new Error('Response is not an array');
  return rows;
}

// Same rounding as api/create-payment-intent.js loadProducts()
function grossOf(priceEx) {
  return parseFloat((parseFloat(priceEx) * 1.23).toFixed(2));
}

// ────────── Checks ──────────

async function run() {
  let rows;
  try {
    rows = await loadCatalog();
  } catch (e) {
    console.error(`ERROR catalog fetch failed (${CATALOG_URL}): ${e.message}`);
    process.exit(2);
  }

  const siteProducts = loadSiteProducts();
  const rowsByVariantId = new Map(rows.map((r) => [r.variant_id, r]));
  const catalogProductIds = new Set(rows.map((r) => r.id));
  const matchedVariantIds = new Set();

  // Internal resolution order: variant_id, variant, id, `${id}-default`
  function resolveInternal(item) {
    for (const candidate of [item.variant_id, item.variant, item.id, `${item.id}-default`]) {
      if (candidate && rowsByVariantId.has(candidate)) return rowsByVariantId.get(candidate);
    }
    return null;
  }

  function checkContract(pid, item, label, knownUnresolved) {
    const row = resolveInternal(item);
    const sent = JSON.stringify(item);
    if (!row) {
      if (knownUnresolved) warn('f', `${label}: ${sent} resolves to NULL (known)`);
      else error('f', `${label}: ${sent} resolves to NULL`);
    } else if (row.id !== pid) {
      error('f', `${label}: ${sent} resolves to ${row.variant_id} of product ${row.id}`);
    }
  }

  const variantOwners = new Map();

  for (const { file, pid, product } of siteProducts) {
    const where = `${file} ${pid}`;
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const productPriceId = product.stripe && product.stripe.priceId;

    // (a) product only in JSON
    if (!catalogProductIds.has(pid)) {
      error('a', `${where}: product not in catalog`);
    }

    if (variants.length > 0) {
      for (const v of variants) {
        const vwhere = `${where}/${v.id}`;
        const row = [v.id, `${pid}-${v.id}`].map((id) => rowsByVariantId.get(id)).find((r) => r && r.id === pid);

        // (a) variant only in JSON
        if (catalogProductIds.has(pid) && !row) error('a', `${vwhere}: variant not in catalog`);

        if (row) {
          matchedVariantIds.add(row.variant_id);
          // (b) gross price
          const jsonPrice = typeof v.price === 'number' ? v.price : product.price;
          const catalogPrice = grossOf(row.price_ex);
          if (Math.abs(jsonPrice - catalogPrice) > 0.01) {
            error('b', `${vwhere}: JSON price ${jsonPrice} vs catalog ${catalogPrice} (price_ex ${row.price_ex})`);
          }
        }

        // (d) no Stripe price id on variant nor product
        if (!v.stripe_price_id && !v.priceId && !productPriceId) {
          error('d', `${vwhere}: no stripe_price_id/priceId on variant and no stripe.priceId on product`);
        }

        // (e) variant id format
        if (typeof v.id !== 'string' || !v.id) {
          error('e', `${vwhere}: missing variant id`);
        } else {
          if (/[A-Z]/.test(v.id)) error('e', `${vwhere}: variant id has uppercase`);
          if (v.id.includes('_')) error('e', `${vwhere}: variant id has '_'`);
          if (/[^A-Za-z0-9_-]/.test(v.id)) error('e', `${vwhere}: variant id has punctuation`);
          if (v.id.split('-').length < 2) error('e', `${vwhere}: variant id is a single token`);
          // (h) long id not prefixed by product id
          if (v.id.split('-').length > 3 && !v.id.startsWith(`${pid}-`)) {
            warn('h', `${vwhere}: variant id has more than 3 tokens and does not start with product id`);
          }
          if (!variantOwners.has(v.id)) variantOwners.set(v.id, []);
          variantOwners.get(v.id).push(pid);
        }

        // (f) contract with the internal
        checkContract(pid, { id: `${pid}-${v.id}`, variant: v.id }, vwhere, false);
      }
    } else {
      const row = [`${pid}-default`, pid].map((id) => rowsByVariantId.get(id)).find((r) => r && r.id === pid);

      // (a) simple product without its default variant
      if (catalogProductIds.has(pid) && !row) error('a', `${where}: no ${pid}-default variant in catalog`);

      if (row) {
        matchedVariantIds.add(row.variant_id);
        // (b) gross price
        const jsonPrice = product.price;
        const catalogPrice = grossOf(row.price_ex);
        if (typeof jsonPrice !== 'number' || Math.abs(jsonPrice - catalogPrice) > 0.01) {
          error('b', `${where}: JSON price ${jsonPrice} vs catalog ${catalogPrice} (price_ex ${row.price_ex})`);
        }
      }

      // (d) simple product without Stripe price id
      if (!productPriceId) error('d', `${where}: simple product without stripe.priceId`);

      // (f) contract with the internal
      checkContract(pid, { id: pid, variant: null }, where, false);
    }

    // (c) category
    const catRow = rows.find((r) => r.id === pid);
    if (catRow && product.category !== catRow.category) {
      error('c', `${where}: category JSON "${product.category}" vs catalog "${catRow.category}"`);
    }

    // (f) wholesale tiers, as sent by js/product-page.js
    const tiers = product.wholesale && Array.isArray(product.wholesale.tiers) ? product.wholesale.tiers : [];
    for (const t of tiers) {
      checkContract(pid, { id: t.id, variant: `${t.quantity} units` }, `${where} wholesale ${t.id}`,
        typeof t.id === 'string' && t.id.startsWith(KNOWN_UNRESOLVED_PREFIX));
    }
  }

  // (e) variant id duplicated across products
  for (const [vid, owners] of variantOwners) {
    if (new Set(owners).size > 1) error('e', `variant id ${vid} used by products ${owners.join(', ')}`);
  }

  // (g) only in catalog
  const sitePids = new Set(siteProducts.map((p) => p.pid));
  for (const r of rows) {
    if (matchedVariantIds.has(r.variant_id)) continue;
    const isProductMissing = !sitePids.has(r.id);
    const expected = EXPECTED_CATALOG_ONLY.has(isProductMissing ? r.id : r.variant_id);
    const kind = isProductMissing ? `product ${r.id} (variant ${r.variant_id})` : `variant ${r.id}/${r.variant_id}`;
    warn('g', `${kind} only in catalog${expected ? ' (expected)' : ''}`);
  }

  // ════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════
  errors.forEach((l) => console.log(l));
  warnings.forEach((l) => console.log(l));
  console.log('══════════════════════════════════════');
  console.log(`CATALOG SYNC: ${siteProducts.length} site products, ${rows.length} catalog rows — ${errors.length} errors, ${warnings.length} warnings`);
  console.log('══════════════════════════════════════');

  process.exit(errors.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal error running catalog sync check:', err);
  process.exit(1);
});
