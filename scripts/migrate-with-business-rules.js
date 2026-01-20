const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// REGRAS DE NEGÓCIO
const BUSINESS_RULES = {
  in_stock: {
    categories: ['Cosmetics'],
    products: ['ghost-white-120ml', 'raven-black-120ml'],
    accessories: ['wrap-grips', 'silicon-caps'],
    needles: ['0.30']
  },
  available_on_request: {
    categories: ['Inks', 'Tattoo Machines', 'Power Supplies'],
    accessories_except: ['wrap-grips', 'silicon-caps']
  },
  available_soon: {
    products: ['the-gloo'],
    needles: ['0.22', '0.25']
  }
};

function determineStockStatus(product, variant) {
  const productId = product.id;
  const category = product.category;
  const variantId = variant && (variant.id || variant.configuration || variant.label) ? (variant.id || variant.configuration || variant.label) : productId;

  if (BUSINESS_RULES.available_soon.products.includes(productId)) {
    return { quantity: 0, stock_status: 'available_soon', override: true };
  }

  if (category === 'Needles' && variantId.includes('022')) {
    return { quantity: 0, stock_status: 'available_soon', override: true };
  }
  if (category === 'Needles' && variantId.includes('025')) {
    return { quantity: 0, stock_status: 'available_soon', override: true };
  }

  if (category === 'Inks') {
    if (productId === 'ghost-white-120ml' || productId === 'raven-black-120ml') {
      return { quantity: 5, stock_status: 'in_stock', override: false };
    }
    return { quantity: 1, stock_status: 'available_on_request', override: false };
  }

  if (category === 'Tattoo Machines' || category === 'Power Supplies') {
    return { quantity: 1, stock_status: 'available_on_request', override: false };
  }

  if (category === 'Accessories') {
    if (productId.includes('wrap-grip') || productId.includes('silicon-cap') || BUSINESS_RULES.in_stock.accessories.includes(productId)) {
      return { quantity: 5, stock_status: 'in_stock', override: false };
    }
    return { quantity: 1, stock_status: 'available_on_request', override: false };
  }

  if (category === 'Needles' && variantId.includes('030')) {
    return { quantity: 5, stock_status: 'in_stock', override: false };
  }

  if (category === 'Cosmetics') {
    return { quantity: 3, stock_status: 'in_stock', override: false };
  }

  const inv = variant && variant.inventory ? variant.inventory : (product.inventory || {});
  return {
    quantity: typeof inv.stock_quantity !== 'undefined' ? inv.stock_quantity : 0,
    stock_status: inv.stock_status || 'out_of_stock',
    override: false
  };
}

async function main() {
  console.log('📦 MIGRANDO COM REGRAS DE NEGÓCIO...\n');

  const dataDir = path.join(__dirname, '..', 'data');
  const files = fs.readdirSync(dataDir)
    .filter(f => f.endsWith('.json'))
    .filter(f => f !== 'category-messages.json');

  let totalDocs = 0;
  const summaryByCategory = {};

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    for (const key of Object.keys(data)) {
      const product = data[key];
      if (!product || typeof product !== 'object') continue;

      const category = product.category || 'Uncategorized';
      const productId = product.id || key;
      const productName = product.name || productId;

      if (Array.isArray(product.variants) && product.variants.length > 0) {
        for (const variant of product.variants) {
          const variantId = variant.id || productId;
          const stockInfo = determineStockStatus(product, variant);

          const docData = {
            productId,
            productName,
            variantLabel: variant.label || null,
            category,
            subcategory: product.subcategory || 'unspecified',
            price: variant.price || product.price || 0,
            stripe_price_id: variant.stripe_price_id || variant.priceId || product.stripe_price_id || null,
            quantity: stockInfo.quantity,
            stock_status: stockInfo.stock_status,
            override: stockInfo.override,
            source: 'business_rules_migration',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
          };

          const collectionName = 'inventory';
          await db.collection(collectionName).doc(variantId).set(docData);

          if (!summaryByCategory[category]) summaryByCategory[category] = { count: 0, in_stock: 0, on_request: 0, soon: 0 };
          summaryByCategory[category].count++;
          if (stockInfo.stock_status === 'in_stock') summaryByCategory[category].in_stock++;
          if (stockInfo.stock_status === 'available_on_request') summaryByCategory[category].on_request++;
          if (stockInfo.stock_status === 'available_soon') summaryByCategory[category].soon++;

          totalDocs++;
          if (totalDocs % 10 === 0) console.log(`Criados ${totalDocs}...`);
        }
      } else {
        const stockInfo = determineStockStatus(product, null);

        const docData = {
          productId,
          productName,
          variantLabel: null,
          category,
          subcategory: product.subcategory || 'unspecified',
          price: product.price || 0,
          stripe_price_id: product.stripe_price_id || product.priceId || null,
          quantity: stockInfo.quantity,
          stock_status: stockInfo.stock_status,
          override: stockInfo.override,
          source: 'business_rules_migration',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('inventory').doc(productId).set(docData);

        if (!summaryByCategory[category]) summaryByCategory[category] = { count: 0, in_stock: 0, on_request: 0, soon: 0 };
        summaryByCategory[category].count++;
        if (stockInfo.stock_status === 'in_stock') summaryByCategory[category].in_stock++;
        if (stockInfo.stock_status === 'available_on_request') summaryByCategory[category].on_request++;
        if (stockInfo.stock_status === 'available_soon') summaryByCategory[category].soon++;

        totalDocs++;
        if (totalDocs % 10 === 0) console.log(`Criados ${totalDocs}...`);
      }
    }
  }

  console.log(`\n✅ MIGRAÇÃO COMPLETA: ${totalDocs} documentos criados\n`);
  console.log('📊 RESUMO POR CATEGORIA:');
  console.log(JSON.stringify(summaryByCategory, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
