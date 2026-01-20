const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function deleteCollection(collectionName) {
  try {
    const snapshot = await db.collection(collectionName).get();
    if (snapshot.empty) {
      console.log(`Collection '${collectionName}' is already empty`);
      return;
    }
    const batchSize = 500;
    let docs = snapshot.docs;
    let deleted = 0;
    while (docs.length) {
      const batch = db.batch();
      for (const doc of docs) {
        batch.delete(doc.ref);
      }
      await batch.commit();
      deleted += docs.length;
      console.log(`  Deleted ${deleted} documents so far from '${collectionName}'...`);
      const next = await db.collection(collectionName).limit(batchSize).get();
      docs = next.docs;
    }
    console.log(`✅ Deleted ${deleted} docs from '${collectionName}'`);
  } catch (e) {
    console.error(`Failed to delete collection ${collectionName}:`, e && e.message);
  }
}

async function main() {
  console.log('🔥 LIMPANDO FIRESTORE COMPLETAMENTE...\n');

  // Deletar collection antiga 'inventory' se existir
  await deleteCollection('inventory');

  // Deletar todas as outras collections possíveis
  const collections = [
    'cosmetics', 'needles', 'inks', 'accessories',
    'tattoo-machines', 'power-supplies',
    'tattoo machines', 'power supplies'
  ];

  for (const col of collections) {
    await deleteCollection(col);
  }

  console.log('\n✅ FIRESTORE COMPLETAMENTE LIMPO!');
  process.exit(0);
}

main().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
