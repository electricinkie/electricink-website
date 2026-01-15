const fs = require('fs');
require('dotenv').config({ path: fs.existsSync('.env.local') ? '.env.local' : '.env' });
const admin = require('firebase-admin');

(async () => {
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT missing');
    let sa = raw;
    if (sa.trim().startsWith('{')) sa = JSON.parse(sa);
    else sa = JSON.parse(Buffer.from(sa, 'base64').toString('utf8'));

    admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
    const db = admin.firestore();

    const id = 'pi_manual_' + Date.now();
    const data = {
      orderId: id,
      paymentIntentId: id,
      status: 'paid',
      paymentStatus: 'succeeded',
      customerEmail: 'contatonegostando@gmail.com',
      customerName: 'Cliente Teste',
      items: [{ id: 'teste', name: 'Teste', quantity: 1, price: 9.99 }],
      total: 9.99,
      total_cents: 999,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'manual-test'
    };

    await db.collection('orders').doc(id).set(data);
    console.log('Created manual order', id);
    const snap = await db.collection('orders').doc(id).get();
    console.log('Exists:', snap.exists);
    console.log(JSON.stringify(snap.data(), null, 2));
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
})();
