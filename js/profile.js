// ============================================
// Profile Page Script - CLEAN VERSION
// ============================================
// - Polls for auth state (like headers do)
// - Renders profile card (avatar, name, email)
// - Loads order history
// - Handles edit profile modal
// ============================================

import { initFirebase } from './firebase-config.js';
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
async function waitForAuthRestore({ timeout = 2500, interval = 150 } = {}) {
  console.log('[Profile] 🔍 Polling for restored auth...');
  const start = Date.now();
  let attempts = 0;
  
  while ((Date.now() - start) < timeout) {
    attempts++;
    try {
      const user = await getCurrentUser();
      if (user) {
        console.log(`[Profile] ✅ User found on attempt ${attempts}:`, user.email);
        return user;
      }
    } catch (e) {
      // Ignore transient errors
    }
    await new Promise(r => setTimeout(r, interval));
  }
  
  console.log('[Profile] ⚠️ No user found after polling');
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

// ────────── Load Orders ──────────
async function loadOrders(identifier) {
  console.log('[Profile] 📦 Loading orders for:', identifier);

  try {
    allOrders = [];
    visibleCount = PAGE_SIZE;
    let orders = [];

    // Determine if identifier is UID or email
    if (typeof identifier === 'string' && !identifier.includes('@')) {
      // Treat as UID: prefer secure server endpoint which verifies ID token
      console.log('[Profile] Using UID lookup via /api/my-orders');
      try {
        const user = await getCurrentUser();
        if (user && typeof user.getIdToken === 'function') {
          try {
            const idToken = await user.getIdToken();
            // DEBUG: log token metadata before sending to server
            console.log('🔑 [DEBUG] Token obtido:', {
              tokenLength: idToken?.length,
              tokenStart: idToken?.substring(0, 20) + '...',
              userUid: user.uid,
              userEmail: user.email
            });
            if (idToken) {
              const resp = await fetch('/api/my-orders', { headers: { Authorization: `Bearer ${idToken}` } });
              if (resp.ok) {
                const json = await resp.json();
                orders = json.orders || [];
              } else {
                console.warn('[Profile] /api/my-orders failed:', resp.status);
              }
            }
          } catch (e) {
            console.warn('[Profile] Could not get idToken for server lookup:', e && e.message);
          }
        }
      } catch (e) {
        console.warn('[Profile] Server lookup failed:', e && e.message);
      }

      // Fallback: try direct UID query via client helper
      if (!orders || orders.length === 0) {
        console.log('[Profile] Fallback to client-side UID query');
        orders = await getUserOrdersByUid(identifier, 100).catch(() => []);
        if (!orders || orders.length === 0) {
          console.log('[Profile] UID lookup empty, trying email fallback');
          const user = await getCurrentUser();
          if (user?.email) {
            orders = await getUserOrdersByEmail(user.email, 100).catch(() => []);
          }
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
      window.location.href = '/';
    } catch (e) {
      console.error('[Profile] Logout failed:', e);
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

    // Load orders
    await loadOrders(user.uid || user.email);

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
        await loadOrders(user.uid || user.email);
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