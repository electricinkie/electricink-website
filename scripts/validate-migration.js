const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function validate() {
  const snapshot = await db.collection('inventory').get();
  
  console.log(`\n📊 TOTAL DE DOCUMENTOS: ${snapshot.size}\n`);
  
  const byStatus = { in_stock: 0, available_on_request: 0, available_soon: 0, out_of_stock: 0 };
  const examples = { in_stock: [], available_on_request: [], available_soon: [], out_of_stock: [] };
  
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const status = data.stock_status || 'out_of_stock';
    if (!byStatus.hasOwnProperty(status)) byStatus[status] = 0;
    byStatus[status]++;
    if (!examples[status]) examples[status] = [];
    if (examples[status].length < 3) {
      examples[status].push(`${doc.id} (${data.productName}, qty: ${data.quantity})`);
    }
  });
  
  console.log('📈 POR STATUS:');
  Object.entries(byStatus).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
    (examples[status] || []).forEach(ex => console.log(`    - ${ex}`));
  });
  
  process.exit(0);
}

validate().catch(err => { console.error(err); process.exit(1); });
