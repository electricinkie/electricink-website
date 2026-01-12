// ============================================
// Profile Page Script - CLEAN VERSION
// ============================================
// - Polls for auth state (like headers do)
// - Renders profile card (avatar, name, email)
// - Loads order history
// - Handles edit profile modal
// ============================================

import { initFirebase, authReady } from './firebase-config.js';
import { getCurrentUser, onAuthChange, openAuthModal, logout } from './auth.js';
import { getUserOrdersByEmail, getUserOrdersByUid } from './orders.js';

const PAGE_SIZE = 5;
let allOrders = [];
let visibleCount = PAGE_SIZE;

// ────────── Helper Functions ──────────
function el(id) { 
  return document.getElementById(id); 
}

function initials(name) {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0] || '').slice(0, 2).join('').toUpperCase();
}

function formatCurrency(v) {
  if (v == null) return '€0.00';
  if (typeof v === 'number') return `€${v.toFixed(2)}`;
  return `€${(v / 100).toFixed(2)}`; // assume cents
}

function formatDate(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString();
  } catch (e) {
    return String(ts);
  }
}

// ────────── Poll for Restored Auth ──────────
async function waitForAuthRestore({ timeout = 2500 } = {}) {
  console.log('[Profile] 🔍 Waiting for auth restoration via authReady...');
  try {
    await initFirebase();
    // Wait for authReady but don't block forever — use timeout
    await Promise.race([authReady, new Promise(res => setTimeout(res, timeout))]);
    const user = await getCurrentUser();
    if (user) {
      console.log('[Profile] ✅ User restored via authReady:', user.email);
      return user;
    }
  } catch (e) {
    console.warn('[Profile] authReady waiting failed:', e && e.message);
  }
  console.log('[Profile] ⚠️ No user found after authReady timeout');
  return null;
}

// ────────── Render Profile Card ──────────
function renderProfile(user) {
  console.log('[Profile] 📝 Rendering profile for:', user?.email || 'none');
  
  if (!user) {
    console.warn('[Profile] ⚠️ renderProfile called with no user');
    return;
  }

  // Show profile card
  const card = el('profileCard');
  if (!card) {
    console.error('[Profile] ❌ profileCard element not found');
    return;
  }
  card.style.display = 'flex';

  // Update name, email, avatar
  const nameEl = el('profileName');
  const emailEl = el('profileEmail');
  const avatarEl = el('avatar');

  if (nameEl) nameEl.textContent = user.displayName || 'Customer';
  if (emailEl) emailEl.textContent = user.email || '';
  if (avatarEl) avatarEl.textContent = initials(user.displayName || user.email);

  // Hide sign-in CTA
  const signInCta = el('signInCta');
  if (signInCta) signInCta.style.display = 'none';

  console.log('[Profile] ✅ Profile card rendered');
}

// ────────── Render Orders List ──────────
function renderOrdersList() {
  const list = el('ordersList');
  if (!list) {
    console.error('[Profile] ❌ ordersList element not found');
    return;
  }

  list.innerHTML = '';
  const slice = allOrders.slice(0, visibleCount);

  if (!slice || slice.length === 0) {
    list.innerHTML = '<div class="orders-empty">No orders found.</div>';
    const loadMoreBtn = el('loadMoreBtn');
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    return;
  }

  slice.forEach(o => {
    const status = o.status || o.order_status || 'pending';
    const total = formatCurrency(o.total);
    const created = o.createdAt?.seconds 
      ? new Date(o.createdAt.seconds * 1000).toISOString()
      : (o.createdAt || o.date || '');

    const item = document.createElement('div');
    item.className = 'order-card';
    item.innerHTML = `
      <div class="order-row">
        <div class="order-id">${o.id || o.orderId || 'N/A'}</div>
        <div class="order-meta">${formatDate(created)} · <strong>${total}</strong></div>
      </div>
      <div class="order-actions">
        <button class="btn-link view-details" data-id="${o.id || o.orderId}">View details</button>
        <span class="order-status ${status}">${status}</span>
      </div>
      <div class="order-details" id="details-${o.id || o.orderId}" style="display:none"></div>
    `;
    list.appendChild(item);
  });

  // Show/hide "Load more" button
  const loadMoreBtn = el('loadMoreBtn');
  if (loadMoreBtn) {
    loadMoreBtn.style.display = allOrders.length > visibleCount ? 'inline-block' : 'none';
  }

  console.log(`[Profile] ✅ Rendered ${slice.length} orders (${allOrders.length} total)`);
}

// ===== NEW: loadMyOrders + render helpers =====
export async function loadMyOrders() {
  const ordersContainer = document.getElementById('ordersList') || document.getElementById('my-orders-list');
  if (!ordersContainer) return;

  ordersContainer.innerHTML = `
    <div class="loading-orders">
      <div class="spinner"></div>
      <p>Loading your orders...</p>
    </div>
  `;

  try {
    const user = await getCurrentUser();
    if (!user) {
      ordersContainer.innerHTML = '<p>Please sign in to view orders.</p>';
      return;
    }

    // Get a fresh ID token and call server endpoint to handle legacy data safely
    let idToken = null;
    try { idToken = await user.getIdToken(); } catch (e) { console.warn('Could not get ID token', e); }
    if (!idToken) {
      ordersContainer.innerHTML = '<p>Authentication required. Please refresh or sign in again.</p>';
      return;
    }

    const url = '/api/my-orders?limit=100';
    const resp = await fetch(url, { headers: { Authorization: 'Bearer ' + idToken } });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(body && body.error ? body.error : `HTTP ${resp.status}`);
    }
    const payload = await resp.json();
    const orders = (payload && payload.orders) ? payload.orders : [];

    if (!orders || orders.length === 0) {
      ordersContainer.innerHTML = `
        <div class="empty-orders">
          <h3>No orders yet</h3>
          <p>Start shopping to see your orders here!</p>
          <a href="/products.html" class="btn-primary">Browse Products</a>
        </div>
      `;
      return;
    }

    // Server returns createdAt as milliseconds where available; renderOrderCard can handle numeric timestamps
    const ordersHtml = orders.map(o => renderOrderCard(o.id || o.orderId || '', o)).join('');
    ordersContainer.innerHTML = ordersHtml;
  } catch (error) {
    console.error('Error loading orders:', error && error.message ? error.message : error);
    ordersContainer.innerHTML = `
      <div class="error-orders">
        <p>Failed to load orders. Please try again.</p>
        <button id="retryOrdersBtn" class="btn-ghost">Retry</button>
      </div>
    `;
    const retry = document.getElementById('retryOrdersBtn');
    if (retry) retry.addEventListener('click', () => loadMyOrders());
  }
}

function renderOrderCard(orderId, order) {
  const date = formatOrderDate(order.createdAt || order.date || order.createdAt);
  const status = (order.status || 'pending').toLowerCase();
  const statusClass = `status-${status}`;
  const statusText = {
    pending: 'Processing',
    paid: 'Paid',
    shipped: 'Shipped',
    delivered: 'Delivered'
  }[status] || (order.status || 'Pending');

  const items = (order.items || []).slice(0, 3).map(item => `
    <div class="order-item">
      <span class="item-name">${(item && item.name) ? escapeHtml(item.name) : 'Product'}</span>
      <span class="item-qty">x${item.quantity || 1}</span>
    </div>
  `).join('');

  const more = (order.items && order.items.length > 3) ? `<p class="more-items">+${order.items.length - 3} more items</p>` : '';
  const total = (typeof order.total === 'number') ? (order.total / (order.total > 1000 ? 100 : 1)).toFixed(2) : (order.total || 0).toFixed ? order.total.toFixed(2) : String(order.total || '0.00');

  return `
    <div class="order-card" data-order-id="${orderId}">
      <div class="order-header">
        <div class="order-info">
          <h3>Order #${String(orderId).slice(-8)}</h3>
          <p class="order-date">${date}</p>
        </div>
        <span class="order-status ${statusClass}">${statusText}</span>
      </div>

      <div class="order-items">
        ${items}
        ${more}
      </div>

      <div class="order-footer">
        <div class="order-total">
          <span>Total:</span>
          <strong>€${Number(order.total || 0).toFixed(2)}</strong>
        </div>
        <button class="btn-view-order btn-primary" data-order-id="${orderId}">View Details</button>
      </div>
    </div>
  `;
}

function formatOrderDate(timestamp) {
  if (!timestamp) return 'Unknown date';
  let date;
  if (timestamp.toDate) date = timestamp.toDate();
  else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
  else date = new Date(timestamp);
  return date.toLocaleDateString('en-IE', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (s) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[s]);
}

// ────────── Load Orders ──────────
async function loadOrders(identifier) {
  console.log('[Profile] 📦 Loading orders for:', identifier);

  try {
    allOrders = [];
    visibleCount = PAGE_SIZE;
    let orders = [];

    // Determine if identifier is UID or email
    if (typeof identifier === 'string' && !identifier.includes('@')) {
      // Treat as UID
      console.log('[Profile] Using UID lookup');
      orders = await getUserOrdersByUid(identifier, 100).catch(() => []);

      // Fallback to email if UID returns nothing
      if (!orders || orders.length === 0) {
        console.log('[Profile] UID lookup empty, trying email fallback');
        const user = await getCurrentUser();
        if (user?.email) {
          orders = await getUserOrdersByEmail(user.email, 100).catch(() => []);
        }
      }
    } else {
      // Treat as email
      console.log('[Profile] Using email lookup');
      orders = await getUserOrdersByEmail(identifier, 100).catch(() => []);
    }

    allOrders = orders || [];
    console.log(`[Profile] ✅ Loaded ${allOrders.length} orders`);
    renderOrdersList();

  } catch (err) {
    console.error('[Profile] ❌ Failed to load orders:', err);
    const list = el('ordersList');
    if (list) {
      list.innerHTML = '<div class="orders-error">Could not load orders. Please try again.</div>';
    }
  }
}

// ────────── Load User Profile from Firestore ──────────
async function loadUserProfile(uid) {
  try {
    const { db } = await initFirebase();
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
    
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    
    if (!snap.exists()) {
      console.log('[Profile] No Firestore user doc found');
      return null;
    }

    console.log('[Profile] ✅ Loaded Firestore user doc');
    return snap.data();
  } catch (err) {
    console.warn('[Profile] ⚠️ Could not load Firestore user doc:', err.message);
    return null;
  }
}

// ────────── Attach Event Listeners ──────────
function attachEvents() {
  console.log('[Profile] 🔗 Attaching event listeners');

  // Sign in CTA
  const signInCta = el('signInCta');
  signInCta?.addEventListener('click', (e) => {
    e.preventDefault();
    openAuthModal('login');
  });

  // Logout button
  const logoutBtn = el('logoutBtn');
  logoutBtn?.addEventListener('click', async () => {
    try {
      await logout();
      try { if (window && window.toast && typeof window.toast.show === 'function') window.toast.show({ message: 'You have been signed out', type: 'removed' }); } catch(e) {}
      // Wait 1 second for toast to be visible before redirecting
      await new Promise(resolve => setTimeout(resolve, 1000));
      window.location.href = '/';
    } catch (e) {
      console.error('[Profile] Logout failed:', e);
      try { if (window && window.toast && typeof window.toast.error === 'function') window.toast.error('Sign out failed'); } catch(e) {}
      // Wait for error toast too
      await new Promise(resolve => setTimeout(resolve, 1000));
      window.location.href = '/'; // Force redirect anyway
    }
  });

  // Edit profile button
  const editProfileBtn = el('editProfileBtn');
  editProfileBtn?.addEventListener('click', async () => {
    try {
      const user = await getCurrentUser();
      const editName = el('editName');
      if (editName) editName.value = user?.displayName || '';
    } catch (err) {
      console.warn('[Profile] Could not get current user for edit:', err);
    }
    
    const editMsg = el('editMsg');
    if (editMsg) editMsg.textContent = '';
    
    const editModal = el('editModal');
    if (editModal) editModal.style.display = 'block';
  });

  // Close edit modal
  const closeEditModal = el('closeEditModal');
  closeEditModal?.addEventListener('click', () => {
    const editModal = el('editModal');
    if (editModal) editModal.style.display = 'none';
  });

  const cancelEdit = el('cancelEdit');
  cancelEdit?.addEventListener('click', () => {
    const editModal = el('editModal');
    if (editModal) editModal.style.display = 'none';
  });

  // Edit form submit
  const editForm = el('editForm');
  editForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const editName = el('editName');
    const editMsg = el('editMsg');
    const name = editName?.value?.trim() || '';

    if (editMsg) editMsg.textContent = 'Saving...';

    try {
      // Update Firebase profile
      try {
        const { auth } = await initFirebase();
        const { updateProfile } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js');
        
        if (auth.currentUser) {
          await updateProfile(auth.currentUser, { displayName: name });
          console.log('[Profile] ✅ Firebase profile updated');
        }
      } catch (inner) {
        console.warn('[Profile] Could not update Firebase profile:', inner);
      }

      // Update UI
      const profileName = el('profileName');
      const avatar = el('avatar');
      const profileEmail = el('profileEmail');

      if (profileName) profileName.textContent = name || 'Customer';
      if (avatar) avatar.textContent = initials(name || profileEmail?.textContent);
      if (editMsg) editMsg.textContent = 'Saved!';

      // Close modal after delay
      setTimeout(() => {
        const editModal = el('editModal');
        if (editModal) editModal.style.display = 'none';
      }, 700);

    } catch (err) {
      console.error('[Profile] Save failed:', err);
      if (editMsg) editMsg.textContent = 'Could not save. Please try again.';
    }
  });

  // Load more orders
  const loadMoreBtn = el('loadMoreBtn');
  loadMoreBtn?.addEventListener('click', () => {
    visibleCount += PAGE_SIZE;
    renderOrdersList();
  });

  // View order details
  const ordersList = el('ordersList');
  ordersList?.addEventListener('click', (e) => {
    const btn = e.target.closest('.view-details');
    if (!btn) return;

    const id = btn.dataset.id;
    const detailsEl = el(`details-${id}`);
    if (!detailsEl) return;

    if (detailsEl.style.display === 'none') {
      const order = allOrders.find(o => (o.id || o.orderId) === id);
      detailsEl.innerHTML = `<pre class="order-pre">${JSON.stringify(order, null, 2)}</pre>`;
      detailsEl.style.display = 'block';
      btn.textContent = 'Hide details';
    } else {
      detailsEl.style.display = 'none';
      btn.textContent = 'View details';
    }
  });
}

// ────────── Initialize Profile Page ──────────
async function initProfilePage() {
  console.log('[Profile] 🚀 Initializing profile page');

  // Attach all event listeners first
  attachEvents();

  // Poll for restored auth (mirrors header behavior)
  const user = await waitForAuthRestore({ timeout: 2500, interval: 150 });

  if (user) {
    console.log('[Profile] ✅ User authenticated:', user.email);
    
    // Render profile immediately
    renderProfile(user);

    // Load Firestore user doc (for discount, etc.)
    try {
      const profileDoc = await loadUserProfile(user.uid);
      if (profileDoc?.discount && profileDoc.discount > 0) {
        const badge = el('discount-badge');
        const value = el('discount-value');
        if (badge && value) {
          value.textContent = `${profileDoc.discount}%`;
          badge.style.display = 'inline-block';
        }
      }
    } catch (err) {
      console.warn('[Profile] Could not load discount:', err);
    }

      // Load orders (use new loadMyOrders implementation)
      await loadMyOrders();

  } else {
    console.log('[Profile] ℹ️ No user found, showing sign-in state');
    
    // Show sign-in CTA
    const signInCta = el('signInCta');
    if (signInCta) signInCta.style.display = 'inline-block';

    // Hide profile card
    const profileCard = el('profileCard');
    if (profileCard) profileCard.style.display = 'none';

    // Show empty state in orders
    const ordersList = el('ordersList');
    if (ordersList) {
      ordersList.innerHTML = '<div class="orders-empty">Sign in to view your orders.</div>';
    }
  }

  // Set up auth observer for real-time updates
  try {
    onAuthChange(async (user) => {
      console.log('[Profile] 📡 onAuthChange fired. User:', user?.email || 'none');
      
      if (user) {
        renderProfile(user);
          await loadMyOrders();
      } else {
        // User logged out
        window.location.href = '/';
      }
    });
  } catch (err) {
    console.warn('[Profile] ⚠️ Could not set up auth observer:', err);
  }
}

// ────────── Auto-Initialize ──────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initProfilePage);
} else {
  initProfilePage();
}