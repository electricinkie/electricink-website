const { getFirestore, admin } = require('./lib/firebase-admin');

async function testFirebase(orderId = 'test-firebase') {
  const db = getFirestore();

  console.log('[TEST-FIREBASE] Checking Firestore for order id:', orderId);

  try {
    const ref = db.collection('orders').doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log('[TEST-FIREBASE] Document not found');
      return { found: false };
    }
    const data = snap.data();
    console.log('[TEST-FIREBASE] Document found:', Object.keys(data).length, 'fields');
    console.log(JSON.stringify(data, null, 2));
    return { found: true, data };
  } catch (err) {
    console.error('[TEST-FIREBASE] Error accessing Firestore:', err && err.message);
    throw err;
  }
}

// Allow running as a script: node api/test-firebase.js <orderId>
if (require.main === module) {
  const id = process.argv[2] || 'pi_test_succeeded_001';
  testFirebase(id).then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { testFirebase };
