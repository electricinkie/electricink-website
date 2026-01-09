import { initFirebase } from './firebase-config.js';

// Firestore helpers for orders (requires appropriate Firestore rules)
export async function getAllOrders(limit = 100) {
  const { db } = await initFirebase();
  const { collection, query, orderBy, limit: limitFn, getDocs } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limitFn(limit));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getUserOrdersByEmail(email, limit = 50) {
  const { db } = await initFirebase();
  const { collection, query, where, orderBy, limit: limitFn, getDocs } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
  const q = query(collection(db, 'orders'), where('customerEmail', '==', email), orderBy('createdAt', 'desc'), limitFn(limit));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Note: admin operations should be performed server-side. This client helper
// is useful for authenticated users if Firestore rules allow it.


/**
 * Creates a new order in Firestore
 * @param {Object} orderData - Order information
 * @param {Array} orderData.items - Cart items
 * @param {number} orderData.total - Total amount
 * @param {string} orderData.paymentIntentId - Stripe Payment Intent ID
 * @param {string} orderData.customerEmail - Customer email
 * @param {string} orderData.customerName - Customer name
 * @param {Object} orderData.shippingAddress - Shipping address (optional)
 * @returns {Promise<string>} - Created order document ID
 */
export async function createOrder(orderData) {
  try {
    const { db, auth } = await initFirebase();
    const { collection, addDoc, Timestamp } = await import(
      'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js'
    );
    
    const user = auth.currentUser;
    
    const order = {
      userId: user?.uid || 'guest',
      userEmail: user?.email || orderData.customerEmail,
      userName: user?.displayName || orderData.customerName,
      items: orderData.items,
      total: orderData.total,
      status: 'paid',
      stripePaymentIntentId: orderData.paymentIntentId,
      shippingAddress: orderData.shippingAddress || null,
      createdAt: Timestamp.now(),
    };

    const docRef = await addDoc(collection(db, 'orders'), order);
    console.log('✅ Order saved to Firestore:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating order:', error);
    throw error;
  }
}
