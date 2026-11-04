#!/usr/bin/env node
'use strict';

// ============================================================
// build-search-index.js
// Run: node scripts/build-search-index.js          (writes the index)
//      node scripts/build-search-index.js --check  (compares, writes nothing)
// Reads data/*.json (same loader as scripts/check-catalog-sync.js) and builds
// data/search/index.json for the site search (js/search.js).
// The index lives in a subfolder on purpose: check-catalog-sync.js reads every
// data/*.json as a product file, and would misread an index placed there.
// No price or stock: the product page shows those live.
// No external dependencies — only Node.js built-ins.
// Exit codes: 0 = ok (or index up to date), 1 = index out of date or invalid
// product data, 2 = could not read the data or write the index.
// ============================================================

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const INDEX_PATH = path.join(DATA_DIR, 'search', 'index.json');
const IGNORED_FILES = new Set(['category-messages.json']);

const CHECK_MODE = process.argv.slice(2).includes('--check');

// ────────── Data loading (same as check-catalog-sync.js) ──────────

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

// ────────── Index ──────────

// Collapse runs of whitespace and trim; non-strings become ''.
function clean(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function uniqueClean(list) {
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const v = clean(item);
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function buildEntries(siteProducts, problems) {
  const entries = [];
  const seen = new Set();

  for (const { file, pid, product } of siteProducts) {
    const id = clean(product.id) || pid;
    const name = clean(product.name);
    const image = clean(product.image);

    if (!name) problems.push(`${file}: ${pid} has no name`);
    if (!image) problems.push(`${file}: ${pid} has no image`);
    if (seen.has(id)) problems.push(`${file}: duplicate id ${id}`);
    seen.add(id);

    entries.push({
      id,
      name,
      category: clean(product.category),
      subcategory: clean(product.subcategory),
      keywords: uniqueClean(product.seo && product.seo.keywords),
      variants: uniqueClean((Array.isArray(product.variants) ? product.variants : []).map((v) => v && v.label)),
      image
    });
  }

  // Stable order so a rebuild only changes the lines of products that changed
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return entries;
}

// One product per line: small file, clean diffs.
function serialize(entries) {
  return '[\n' + entries.map((e) => JSON.stringify(e)).join(',\n') + '\n]\n';
}

// ────────── Run ──────────

function run() {
  let siteProducts;
  try {
    siteProducts = loadSiteProducts();
  } catch (e) {
    console.error(`ERROR could not read product data in ${DATA_DIR}: ${e.message}`);
    process.exit(2);
  }

  const problems = [];
  const entries = buildEntries(siteProducts, problems);
  if (problems.length > 0) {
    problems.forEach((p) => console.error(`ERROR ${p}`));
    process.exit(1);
  }

  const output = serialize(entries);
  const rel = path.relative(process.cwd(), INDEX_PATH);

  if (CHECK_MODE) {
    let current = null;
    try {
      current = fs.readFileSync(INDEX_PATH, 'utf8');
    } catch (e) {
      console.error(`ERROR ${rel} not found. Run: npm run build:search`);
      process.exit(1);
    }
    if (current !== output) {
      console.error(`ERROR ${rel} is out of date with data/*.json. Run: npm run build:search`);
      process.exit(1);
    }
    console.log(`SEARCH INDEX: up to date (${entries.length} products)`);
    process.exit(0);
  }

  try {
    fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
    fs.writeFileSync(INDEX_PATH, output, 'utf8');
  } catch (e) {
    console.error(`ERROR could not write ${rel}: ${e.message}`);
    process.exit(2);
  }
  console.log(`SEARCH INDEX: wrote ${rel} (${entries.length} products, ${Buffer.byteLength(output)} bytes)`);
  process.exit(0);
}

run();
