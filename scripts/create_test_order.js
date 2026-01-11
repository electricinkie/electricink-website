const admin = require('firebase-admin');
const path = require('path');

async function main() {
  try {
    const serviceAccountPath = path.join(__dirname, '..', 'api', 'serviceAccountKey.json');
    const serviceAccount = require(serviceAccountPath);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });

    const db = admin.firestore();
    const Timestamp = admin.firestore.Timestamp;
    const now = Timestamp.now();

    // Use test product from data/products-cosmetics.json: test-product-sandbox
    const order = {
      paymentIntentId: `test_pi_${Date.now()}`,
      orderId: `test_order_${Date.now()}`,
      status: 'paid',
      paymentStatus: 'succeeded',
      customerEmail: 'contatonegostando@gmail.com',
      customerName: 'Test Customer',
      customerPhone: '',
      shippingAddress: {
        line1: '1 Test Street',
        city: 'Dublin',
        postalCode: 'D01',
        country: 'IE'
      },
      items: [
        {
          id: 'test-product-sandbox',
          name: 'Teste Product (Sandbox)',
          quantity: 1,
          price: 1.5
        }
      ],
      shippingMethod: 'standard',
      shippingCost_cents: 0,
      subtotal_cents: 150,
      total_cents: 150,
      subtotal: 1.5,
      total: 1.5,
      currency: 'eur',
      createdAt: now,
      paidAt: now,
      source: 'manual-test-script'
    };

    const ref = await db.collection('orders').add(order);
    console.log('✅ Test order created:', ref.id);
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to create test order:', err);
    process.exit(1);
  }
}

main();
