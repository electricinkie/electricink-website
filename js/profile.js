import { initFirebase } from './firebase-config.js';
import { initAuth, getCurrentUser, logout } from './auth.js';
import { getUserOrdersByEmail } from './orders.js';

function formatCurrency(v) {
  return `€${v.toFixed(2)}`;
}

async function renderOrders(orders) {
  const el = document.getElementById('orders-list');
  if (!el) return;
  if (!orders || orders.length === 0) {
    el.textContent = 'Nenhum pedido encontrado.';
    return;
  }
  el.innerHTML = orders.map(o => {
    const date = new Date(o.createdAt?.seconds ? o.createdAt.seconds * 1000 : o.createdAt || Date.now());
    const items = (o.items || []).map(it => `${it.name} x${it.quantity}`).join(', ');
    return `
      <div class="order-card">
        <div class="order-meta">Pedido: ${o.id || o.orderId} — ${date.toLocaleDateString()}</div>
        <div class="order-items">${items}</div>
        <div class="order-meta">Total: ${formatCurrency(o.total || 0)}</div>
      </div>
    `;
  }).join('');
}

async function loadProfile() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/';
    return;
  }

  document.getElementById('user-name').textContent = user.displayName || 'User';
  document.getElementById('user-email').textContent = user.email || '';

  // Load Firestore user doc for discount
  try {
    const { db } = await initFirebase();
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
    const snap = await getDoc(doc(db, 'users', user.uid));
    const data = snap?.data() || {};
    if (data.discount && Number(data.discount) > 0) {
      const badge = document.getElementById('discount-badge');
      const val = document.getElementById('discount-value');
      if (badge && val) {
        val.textContent = `${Number(data.discount)}%`;
        badge.style.display = 'inline-block';
      }
    }
  } catch (err) {
    console.warn('Could not load user discount', err);
  }

  // Load orders
  try {
    const orders = await getUserOrdersByEmail(user.email);
    await renderOrders(orders);
  } catch (err) {
    console.warn('Failed to load orders', err);
    const el = document.getElementById('orders-list');
    if (el) el.textContent = 'Erro ao carregar pedidos.';
  }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  initAuth().catch(() => {});
  loadProfile();
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try { await logout(); window.location.href = '/'; } catch (e) { console.warn(e); }
    });
  }
});
import { openAuthModal, logout as authLogout, onAuthChange, getCurrentUser } from './auth.js';
import { getUserOrdersByEmail } from './orders.js';
import { initFirebase } from './firebase-config.js';

const PAGE_SIZE = 5;
let allOrders = [];
let visibleCount = PAGE_SIZE;

function el(id) { return document.getElementById(id); }

function initials(name) {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0] || '').slice(0,2).join('').toUpperCase();
}

function formatDate(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString();
  } catch (e) { return ts; }
}

function renderProfile(user) {
  if (!user) return;
  const card = el('profileCard'); if (!card) return;
  card.style.display = 'flex';
  el('profileName').textContent = user.displayName || 'Customer';
  el('profileEmail').textContent = user.email || '';
  el('avatar').textContent = initials(user.displayName || user.email);
}

function renderOrders() {
  const list = el('ordersList');
  list.innerHTML = '';
  const slice = allOrders.slice(0, visibleCount);
  if (slice.length === 0) {
    list.innerHTML = '<div class="orders-empty">No orders found.</div>';
    el('loadMoreBtn').style.display = 'none';
    return;
  }

  slice.forEach(o => {
    const status = o.status || o.order_status || 'unknown';
    const total = (o.total != null) ? (typeof o.total === 'number' ? `€${o.total.toFixed(2)}` : `€${(o.total/100).toFixed(2)}`) : '€0.00';
    const created = o.createdAt ? (o.createdAt.seconds ? (new Date(o.createdAt.seconds*1000)).toISOString() : o.createdAt) : o.createdAt || o.date || '';

    const item = document.createElement('div');
    item.className = 'order-card';
    item.innerHTML = `
      <div class="order-row">
        <div class="order-id">${o.id}</div>
        <div class="order-meta">${formatDate(created)} · <strong>${total}</strong></div>
      </div>
      <div class="order-actions">
        <button class="btn-link view-details" data-id="${o.id}">View details</button>
        <span class="order-status ${status}">${status}</span>
      </div>
      <div class="order-details" id="details-${o.id}" style="display:none"></div>
    `;

    list.appendChild(item);
  });

  // Show load more if there are more
  if (allOrders.length > visibleCount) {
    el('loadMoreBtn').style.display = 'inline-block';
  } else {
    el('loadMoreBtn').style.display = 'none';
  }
}

async function loadOrders(email) {
  try {
    allOrders = [];
    visibleCount = PAGE_SIZE;
    // Attempt to fetch orders (if Firebase config missing, this will throw)
    const orders = await getUserOrdersByEmail(email, 100);
    allOrders = orders || [];
    renderOrders();
  } catch (err) {
    const list = el('ordersList');
    if (list) list.innerHTML = '<div class="orders-error">Could not load orders. Please check your connection or permissions.</div>';
    console.error('Orders load failed', err);
  }
}

async function loadUserProfile(uid) {
  try {
    const { db } = await initFirebase();
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data();
  } catch (err) {
    console.warn('Could not load user profile doc', err);
    return null;
  }
}

function attachEvents() {
  // Sign in CTA
  const signInCta = el('signInCta');
  signInCta?.addEventListener('click', (e) => { e.preventDefault(); openAuthModal('login'); });

  // Logout
  el('logoutBtn')?.addEventListener('click', async () => {
    try {
      await authLogout();
      window.location.href = '/';
    } catch (err) {
      console.error('Logout failed', err);
      alert('Logout failed. Please try again.');
    }
  });

  // Edit profile modal
  el('editProfileBtn')?.addEventListener('click', async () => {
    try {
      const user = await getCurrentUser();
      el('editName').value = user?.displayName || '';
    } catch (err) {
      // Firebase not available — use displayed name as fallback
      el('editName').value = el('profileName')?.textContent || '';
    }
    el('editMsg').textContent = '';
    el('editModal').style.display = 'block';
  });

  el('closeEditModal')?.addEventListener('click', () => { el('editModal').style.display = 'none'; });
  el('cancelEdit')?.addEventListener('click', () => { el('editModal').style.display = 'none'; });

  el('editForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = el('editName').value.trim();
    el('editMsg').textContent = 'Saving...';
    try {
      // Try to update firebase profile if available
      try {
        const { auth } = await initFirebase();
        const { updateProfile } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js');
        if (auth.currentUser) {
          await updateProfile(auth.currentUser, { displayName: name });
        }
      } catch (inner) {
        // Firebase may not be configured; ignore
        console.warn('Could not update profile on Firebase', inner);
      }

      // Update UI
      el('profileName').textContent = name || 'Customer';
      el('avatar').textContent = initials(name || el('profileEmail').textContent);
      el('editMsg').textContent = 'Saved';
      setTimeout(() => { el('editModal').style.display = 'none'; }, 700);
    } catch (err) {
      console.error('Save profile failed', err);
      el('editMsg').textContent = 'Could not save profile.';
    }
  });

  // Load more
  el('loadMoreBtn')?.addEventListener('click', () => {
    visibleCount += PAGE_SIZE;
    renderOrders();
  });

  // Delegate view details
  el('ordersList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.view-details');
    if (!btn) return;
    const id = btn.dataset.id;
    const detailsEl = el(`details-${id}`);
    if (!detailsEl) return;
    if (detailsEl.style.display === 'none') {
      // find order
      const order = allOrders.find(o => o.id === id);
      detailsEl.innerHTML = `<pre class="order-pre">${JSON.stringify(order, null, 2)}</pre>`;
      detailsEl.style.display = 'block';
      btn.textContent = 'Hide details';
    } else {
      detailsEl.style.display = 'none';
      btn.textContent = 'View details';
    }
  });
}

// Init when DOM ready: attach events and observe auth
document.addEventListener('DOMContentLoaded', () => {
  attachEvents();

  (async () => {
    try {
      await onAuthChange(async (user) => {
        if (user) {
          const signInEl = el('signInCta'); if (signInEl) signInEl.style.display = 'none';
          renderProfile(user);
          // Try to load Firestore user doc to get discount and other metadata
          try {
            const profileDoc = await loadUserProfile(user.uid);
            if (profileDoc && typeof profileDoc.discount === 'number' && profileDoc.discount > 0) {
              const badge = el('discount-badge') || el('profile-discount-badge');
              const value = el('discount-value') || el('profile-discount-value');
              if (badge && value) {
                value.textContent = `${profileDoc.discount}%`;
                badge.style.display = '';
              }
            }
          } catch (inner) { /* ignore */ }
          await loadOrders(user.email);
        } else {
          const signInEl = el('signInCta'); if (signInEl) signInEl.style.display = 'inline-block';
          const card = el('profileCard'); if (card) card.style.display = 'none';
          const list = el('ordersList'); if (list) list.innerHTML = '<div class="orders-empty">Sign in to view your orders.</div>';
        }
      });
    } catch (err) {
      // Firebase not configured or init failed — show fallback UI
      console.warn('Auth observer not available', err);
      const signInEl = el('signInCta'); if (signInEl) signInEl.style.display = 'inline-block';
      const card = el('profileCard'); if (card) card.style.display = 'none';
      const list = el('ordersList'); if (list) list.innerHTML = '<div class="orders-empty">Sign in to view your orders.</div>';
    }
  })();
});
