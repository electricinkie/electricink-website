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

export async function getUserOrdersByUid(uid, limit = 50) {
  // Query orders by `userId` (preferred). This relies on server/webhook
  // persisting `userId` into the order document when available.
  const { db } = await initFirebase();
  const { collection, query, where, orderBy, limit: limitFn, getDocs } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
  const q = query(collection(db, 'orders'), where('userId', '==', uid), orderBy('createdAt', 'desc'), limitFn(limit));
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
  /**
   * DEPRECATED / PROTECTED
   * Client-side order creation is disabled by default to avoid accidental
   * or malicious writes. Orders MUST be created server-side by the Stripe
   * webhook (`/api/webhooks-stripe.js`).
   *
   * For local development/testing only: set
   * `window.__ALLOW_CLIENT_ORDER_CREATION = true` in the browser console
   * before calling this function. When not explicitly allowed this will
   * throw an Error with guidance.
   */
  const isBrowser = (typeof window !== 'undefined');
  const allowFlag = isBrowser && !!window.__ALLOW_CLIENT_ORDER_CREATION;
  const allowLocalhost = isBrowser && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  if (!allowFlag && !allowLocalhost) {
    throw new Error('createOrder() is deprecated on the client. Orders are created only via the server webhook. For local testing set window.__ALLOW_CLIENT_ORDER_CREATION = true.');
  }

  // If explicitly allowed (dev), preserve original behavior to aid testing.
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
    console.log('✅ Order saved to Firestore (client dev mode):', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating order (client):', error);
    throw error;
  }
}
