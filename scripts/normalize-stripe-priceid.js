#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const dataDir = path.join(process.cwd(), 'data');

function listDataFiles() {
  return fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && (/^product/.test(f) || /^products-/.test(f) || /products-/.test(f)));
}

let totalModified = 0;

for (const file of listDataFiles()) {
  const fp = path.join(dataDir, file);
  let raw;
  try { raw = fs.readFileSync(fp, 'utf8'); } catch (e) { console.error('Failed to read', fp, e.message); continue; }

  let json;
  try { json = JSON.parse(raw); } catch (e) { console.error('Invalid JSON in', fp, e.message); continue; }

  let modified = 0;

  const isArray = Array.isArray(json);

  const iterate = isArray ? json : Object.values(json);

  iterate.forEach(prod => {
    if (!prod) return;
    const hasNoVariants = !prod.variants || (Array.isArray(prod.variants) && prod.variants.length === 0);
    const productLevelPrice = prod.stripe && (prod.stripe.priceId || prod.stripe.price_id);
    if (hasNoVariants && productLevelPrice && !prod.stripe_price_id) {
      prod.stripe_price_id = prod.stripe.priceId || prod.stripe.price_id;
      modified++;
    }
  });

  if (modified > 0) {
    try {
      fs.writeFileSync(fp, JSON.stringify(json, null, 2));
      console.log(`✅ ${file} — added stripe_price_id to ${modified} product(s)`);
      totalModified += modified;
    } catch (e) {
      console.error('Failed to write', fp, e.message);
    }
  } else {
    console.log(`— ${file} — no changes`);
  }
}

console.log('\nTotal modified products:', totalModified);
if (totalModified === 0) console.log('No changes needed.');
else console.log('✅ Normalization complete — commit changes if desired.');
