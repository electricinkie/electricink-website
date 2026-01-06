const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

let products = {};
for (const file of files) {
  const filePath = path.join(dataDir, file);
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  products = { ...products, ...content };
}

const productKeys = Object.keys(products);
const variantIds = [];
for (const p of Object.values(products)) {
  if (p.variants && Array.isArray(p.variants)) {
    for (const v of p.variants) {
      if (v.id) variantIds.push(v.id);
      if (v.priceId) variantIds.push(v.priceId);
    }
  }
}

function hasRepeatedPrefix(id) {
  const tokens = id.split('-');
  for (let k = 1; k <= Math.floor(tokens.length / 2); k++) {
    let repeated = true;
    for (let i = 0; i < k; i++) {
      if (tokens[i] !== tokens[i + k]) { repeated = false; break; }
    }
    if (repeated) return true;
  }
  return false;
}

console.log('Total products:', productKeys.length);
console.log('Total variant ids:', variantIds.length);

const suspicious = [];
for (const id of [...productKeys, ...variantIds]) {
  if (!id) continue;
  if (hasRepeatedPrefix(id)) suspicious.push({ id, reason: 'repeated-prefix' });
  if (id.split('-').length >= 6) suspicious.push({ id, reason: 'many-tokens' });
}

if (suspicious.length === 0) {
  console.log('No suspicious IDs found.');
} else {
  console.log('Suspicious IDs found:');
  for (const s of suspicious) console.log('-', s.id, s.reason);
}

// Also output full list to help manual comparison
console.log('\nAll product IDs:');
for (const k of productKeys) console.log('-', k);
console.log('\nAll variant IDs (and price ids):');
for (const v of variantIds) console.log('-', v);
