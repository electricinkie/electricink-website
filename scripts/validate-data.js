const fs = require('fs');
const path = require('path');

const files = ['products-cosmetics.json', 'products-needles-022.json', 'products-needles-025.json', 'products-needles-030.json'];

files.forEach(f => {
  const p = path.join(__dirname, '..', 'data', f);
  if (!fs.existsSync(p)) {
    console.log(`❌ ${f} não existe!`);
    return;
  }

  try {
    const raw = fs.readFileSync(p, 'utf8');
    const data = JSON.parse(raw);
    const products = Object.values(data);

    console.log(`\n📦 ${f}:`);
    console.log(`  Total produtos: ${products.length}`);

    // Check unique IDs
    const ids = products.map((pr) => pr.id || pr.slug || JSON.stringify(pr).slice(0,10));
    const duplicates = ids.filter((v, i, a) => a.indexOf(v) !== i);
    if (duplicates.length) {
      console.log('  ❌ IDs duplicados detectados:', [...new Set(duplicates)].join(', '));
    }

    products.forEach(pdt => {
      const missing = [];
      if (!pdt.id) missing.push('id');
      if (!pdt.name) missing.push('name');
      if (!pdt.category) missing.push('category');
      if (!pdt.stripe || !pdt.stripe.productId) missing.push('stripe.productId');
      if (!pdt.stripe || (!pdt.stripe.priceId && !pdt.variants)) missing.push('stripe.priceId or variants');
      if (!pdt.price && !pdt.variants) missing.push('price');

      if (missing.length > 0) {
        console.log(`  ❌ ${pdt.id || 'unknown'}: falta ${missing.join(', ')}`);
      }

      // Heuristic check for test IDs
      if (pdt.stripe && pdt.stripe.productId && /^prod_Tj/.test(pdt.stripe.productId)) {
        console.log(`  ⚠️  ${pdt.id}: productId parece TEST (${pdt.stripe.productId})`);
      }
      if (pdt.stripe && pdt.stripe.priceId && /^price_1Sm/.test(pdt.stripe.priceId)) {
        console.log(`  ⚠️  ${pdt.id}: priceId parece TEST (${pdt.stripe.priceId})`);
      }

      if (pdt.price && (pdt.price <= 0 || pdt.price > 100000)) {
        console.log(`  ⚠️  ${pdt.id}: preço suspeito (${pdt.price})`);
      }

      // Check image files exist
      if (pdt.image) {
        const imgPath = path.join(__dirname, '..', pdt.image.replace(/^\//, ''));
        if (!fs.existsSync(imgPath)) {
          console.log(`  ⚠️  ${pdt.id}: imagem referenciada não encontrada (${pdt.image})`);
        }
      }
    });

    console.log('  ✅ Validação completa');
  } catch (err) {
    console.log(`❌ Falha ao validar ${f}:`, err && err.message);
  }
});
