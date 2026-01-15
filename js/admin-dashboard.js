import { initFirebase, authReady } from './firebase-config.js';
import { requireAdmin } from './admin-check.js';

/**
 * 🔧 FIX: Normaliza valores monetários para euros (decimal)
 * Firebase pode armazenar como cents (int) ou euros (float)
 * - Se > 1000 e inteiro → assume cents, divide por 100
 * - Se decimal ou < 1000 → assume euros, retorna direto
 */
function normalizeToEuros(value) {
  if (value == null || value === undefined) return 0;
  const num = Number(value);
  if (isNaN(num)) return 0;
  if (Number.isInteger(num) && Math.abs(num) > 1000) {
    return num / 100;
  }
  return num;
}

/**
 * 🔧 FIX: Formata valor para exibição (sempre em euros)
 */
function formatCurrency(value) {
  const euros = normalizeToEuros(value);
  return `€${euros.toFixed(2)}`;
}

const { auth, db } = await initFirebase();

// Show cached admin display name immediately for snappy UX (display-only)
try {
  const cachedAdminName = localStorage.getItem('ei_admin_name');
  if (cachedAdminName) {
    const nameEl = document.getElementById('admin-name');
    if (nameEl) nameEl.textContent = cachedAdminName;
  }
} catch (e) { /* ignore storage errors */ }
let currentOrderId = null;

function buildTrackingUrl(carrier, trackingNumber) {
  const baseUrls = {
    'anpost': 'https://track.anpost.com/TrackingResults.aspx?trackcode=',
    'dpd': 'https://www.dpd.ie/tracking?parcelNumber=',
    'fastway': 'https://www.fastway.ie/track-your-parcel?l=',
    'ups': 'https://www.ups.com/track?tracknum=',
    'dhl': 'https://www.dhl.com/ie-en/home/tracking.html?tracking-id=',
    'custom': ''
  };
  return carrier === 'custom' ? trackingNumber : (baseUrls[carrier] || '') + trackingNumber;
}

// Load dashboard on DOM ready
/*
document.addEventListener('DOMContentLoaded', () => {
  loadDashboard().catch(err => console.error('Dashboard init error', err));
});
*/

export async function loadDashboard() {
  try { performance.mark && performance.mark('auth-start'); } catch (e) {}
  let user = auth.currentUser;
  if (!user) {
    try {
      // Wait briefly for auth restoration if transiently null
      await Promise.race([authReady, new Promise(res => setTimeout(() => res(null), 5000))]);
    } catch (e) {}
    user = auth.currentUser;
  }
  if (!user) return window.location.href = '/';

  try { performance.mark && performance.mark('auth-restored'); } catch (e) {}
  try { performance.measure && performance.measure('auth-restore', 'auth-start', 'auth-restored'); } catch (e) {}

  const adminNameEl = document.getElementById('admin-name');
  const finalName = user.displayName || user.email;
  if (adminNameEl) adminNameEl.textContent = finalName;
  try { localStorage.setItem('ei_admin_name', finalName); } catch (e) {}
  await loadStats();
  // Attach dashboard listeners once (safe to call multiple times)
  try { initDashboardListeners(); } catch (e) { console.warn('initDashboardListeners failed', e); }

  await loadOrders();
}

async function loadStats() {
  try {
    const { collection, getDocs, query, where, orderBy } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
    const { Timestamp } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');

    const ordersCol = collection(db, 'orders');

    // total orders
    const allSnap = await getDocs(query(ordersCol));
    document.getElementById('total-orders').textContent = String(allSnap.size || 0);

    // pending
    const pendingSnap = await getDocs(query(ordersCol, where('status', '==', 'pending')));
    document.getElementById('pending-count').textContent = String(pendingSnap.size || 0);

    // todays sales - buscar TODOS e filtrar manualmente (usar timezone Dublin)
    const now = new Date();
    const dublinTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Dublin' }));
    const todayStart = new Date(dublinTime);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(dublinTime);
    todayEnd.setHours(23, 59, 59, 999);

    console.log('[Dashboard] 📅 Today range:', { start: todayStart.toISOString(), end: todayEnd.toISOString() });

    const allOrdersSnap = await getDocs(query(ordersCol));
    let todaySales = 0;

    const rawValues = [];

    allOrdersSnap.forEach(d => {
      const o = d.data();

      // Obtain order date
      let orderDate = null;
      if (o.paidAtMillis) orderDate = new Date(o.paidAtMillis);
      else if (o.createdAtMillis) orderDate = new Date(o.createdAtMillis);
      else {
        const ts = o.paidAt || o.createdAt;
        if (ts && typeof ts.toDate === 'function') orderDate = ts.toDate();
        else if (ts && ts.seconds) orderDate = new Date(ts.seconds * 1000);
        else if (typeof ts === 'number' || typeof ts === 'string') orderDate = new Date(ts);
      }

      if (!orderDate || isNaN(orderDate.getTime())) return;

      // Check if order falls within today (Dublin timezone)
      if (orderDate >= todayStart && orderDate <= todayEnd) {
        const raw = o.total || o.amount || o.total_cents || 0;
        const normalized = normalizeToEuros(raw);
        todaySales += normalized;
        rawValues.push({ id: d.id, raw, normalized });
      }
    });

    console.log('[Dashboard] 📊 Today sales calculation:', {
      ordersCount: rawValues.length,
      totalEuros: todaySales.toFixed(2),
      rawValues
    });

    document.getElementById('today-sales').textContent = formatCurrency(todaySales);
  } catch (err) {
    console.error('Erro ao carregar estatísticas:', err);
    try { document.getElementById('total-orders').textContent = '—'; } catch (e) {}
    try { document.getElementById('pending-count').textContent = '—'; } catch (e) {}
    try { document.getElementById('today-sales').textContent = '—'; } catch (e) {}
  }
}

const PAGE_SIZE = 20;
const lastDocByStatus = {}; // store last doc per status for pagination
const hasMoreByStatus = {};

async function loadOrders(status = 'all', reset = true) {
  try { performance.mark && performance.mark('orders-fetch-start'); } catch (e) {}
  const tbody = document.getElementById('orders-tbody');
  const loadMoreBtn = document.getElementById('loadMoreOrdersBtn');

  if (reset) {
    tbody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
    try { tbody.setAttribute('aria-busy', 'true'); } catch (e) {}
    lastDocByStatus[status] = null;
    hasMoreByStatus[status] = true;
  }

  if (!hasMoreByStatus[status]) {
    // Nothing more to load
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    return;
  }

  try {
    const { collection, getDocs, query, where, orderBy, limit: _limit, startAfter } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
    let q;
    const col = collection(db, 'orders');
    const pageLimit = _limit(PAGE_SIZE);

    if (status !== 'all') {
      q = query(col, where('status', '==', status), orderBy('createdAt', 'desc'), pageLimit);
    } else {
      q = query(col, orderBy('createdAt', 'desc'), pageLimit);
    }

    const last = lastDocByStatus[status];
    if (last) {
      q = query(q, startAfter(last));
    }

    const snap = await getDocs(q);

    if (reset) tbody.innerHTML = '';

    try { performance.mark && performance.mark('orders-fetch-end'); } catch (e) {}
    try { performance.measure && performance.measure('orders-fetch', 'orders-fetch-start', 'orders-fetch-end'); } catch (e) {}

    if (snap.empty) {
      if (reset) {
        tbody.innerHTML = '<tr><td colspan="6">No orders found</td></tr>';
      }
      hasMoreByStatus[status] = false;
      if (loadMoreBtn) loadMoreBtn.style.display = 'none';
      return;
    }

    snap.forEach(docSnap => {
      const order = docSnap.data();
      const row = document.createElement('tr');
      row.classList.add('order-row');
      row.dataset.orderId = docSnap.id;

      row.innerHTML = `
      <td data-label="Order ID"><strong>${docSnap.id}</strong></td>
      <td data-label="Customer">
        ${order.customerName || order.customerEmail || ''}
        ${order.userId ? `<div class="small muted">UID: ${order.userId}</div>` : ''}
      </td>
      <td data-label="Date">${formatDate(order.paidAt || order.createdAt)}</td>
      <td data-label="Total">${formatCurrency(order.total || order.amount || order.total_cents)}</td>
      <td data-label="Status"><span class="status-badge status-${order.status}">${translateStatus(order.status)}</span></td>
      <td data-label="Actions">
        <button class="btn-sm btn-view" data-order-id="${docSnap.id}">View</button>
        ${order.status === 'pending' ? `<button class="btn-sm btn-success btn-ship" data-order-id="${docSnap.id}">Mark as Shipped</button>` : ''}
      </td>
    `;

      tbody.appendChild(row);
    });

    // Update lastDoc and hasMore
    lastDocByStatus[status] = snap.docs[snap.docs.length - 1];
    hasMoreByStatus[status] = snap.docs.length === PAGE_SIZE;

    if (loadMoreBtn) {
      loadMoreBtn.style.display = hasMoreByStatus[status] ? 'inline-block' : 'none';
    }
    try { tbody.removeAttribute('aria-busy'); } catch (e) {}

  } catch (err) {
    console.error('Erro ao carregar pedidos:', err);
    tbody.innerHTML = `<tr><td colspan="6">Error loading orders: ${err?.message || 'See console'}</td></tr>`;
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    try { tbody.removeAttribute('aria-busy'); } catch (e) {}
  }
}

// Handler to load next page
async function loadMoreOrders() {
  const status = document.getElementById('status-filter')?.value || 'all';
  await loadOrders(status, false);
}

window.viewOrder = async function(orderId) {
  const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
  const snap = await getDoc(doc(db, 'orders', orderId));
  if (!snap.exists()) return alert('Order not found');
  const order = snap.data();
  currentOrderId = orderId;

    const detailsHtml = `
    <div class="order-info">
      <p><strong>Order ID:</strong> ${orderId}</p>
      <p><strong>Customer:</strong> ${order.customerName || ''}</p>
      <p><strong>UID:</strong> ${order.userId || 'guest'}</p>
      <p><strong>Email:</strong> ${order.customerEmail || ''}</p>
      <p><strong>Date:</strong> ${formatDate(order.paidAt || order.createdAt)}</p>
      <p><strong>Status:</strong> <span class="order-status status-badge status-${order.status}">${translateStatus(order.status)}</span></p>
      <p><strong>Total:</strong> ${formatCurrency(order.total || order.amount || order.total_cents)}</p>
    </div>
    <h3>Items:</h3>
    <ul class="order-items">
      ${(order.items || []).map(i => {
        const itemTotal = normalizeToEuros(i.price) * (i.quantity || 1);
        return `<li>${i.name} x${i.quantity} - ${formatCurrency(itemTotal)}</li>`;
      }).join('')}
    </ul>
    <h3>Shipping address:</h3>
    <p>${order.shippingAddress?.line1 || 'N/A'}</p>
    <p>${order.shippingAddress?.city || ''} ${order.shippingAddress?.postal_code || ''}</p>
  `;
  document.getElementById('order-details').innerHTML = detailsHtml;
  document.getElementById('order-modal').style.display = 'flex';

  // Attach click handler to modal's "Mark as Shipped" button so it opens the shipping form
  // Use .onclick to replace any previous handlers and avoid accumulating listeners
  const modalShowBtn = document.getElementById('show-shipping-form-btn');
  if (modalShowBtn) {
    modalShowBtn.onclick = (ev) => { ev.preventDefault(); try { window.markAsShipped(); } catch (e) { console.error('markAsShipped call failed', e); } };
  }

  // Ensure the modal close button reliably closes the modal (fix lost/removed inline handlers)
  try {
    const modalCloseBtn = document.querySelector('#order-modal .close');
    if (modalCloseBtn) {
      modalCloseBtn.onclick = (ev) => { ev.preventDefault(); try { window.closeModal(); } catch (e) { console.error('closeModal call failed', e); } };
    }
  } catch (e) { console.warn('Failed to attach close button handler', e); }
};

window.markAsShipped = async function() {
  if (!currentOrderId) return;

  try {
    const shippingFormContainer = document.getElementById('shipping-form-container');
    const showBtn = document.getElementById('show-shipping-form-btn');
    const shippingActions = document.getElementById('shipping-actions');
    const cancelBtn = document.getElementById('cancel-shipping-btn');
    const form = document.getElementById('shipping-form');

    if (!form || !shippingFormContainer) {
      throw new Error('Shipping form not found in DOM');
    }

    // Show form UI
    if (showBtn) showBtn.style.display = 'none';
    shippingFormContainer.style.display = 'block';
    if (shippingActions) shippingActions.style.display = 'flex';

    // Cancel handler to revert UI
    const onCancel = () => {
      if (shippingFormContainer) shippingFormContainer.style.display = 'none';
      if (showBtn) showBtn.style.display = '';
      if (shippingActions) shippingActions.style.display = 'none';
      cancelBtn && cancelBtn.removeEventListener('click', onCancel);
      form && (form.onsubmit = null);
    };

    cancelBtn && cancelBtn.addEventListener('click', onCancel, { once: true });

    // Form submit handler
    form.onsubmit = async function(e) {
      e.preventDefault();
      let submitBtn = null;
      let tableShipBtn = null;
      try {
        submitBtn = form.querySelector('button[type="submit"]');
        tableShipBtn = document.querySelector(`button.btn-ship[data-order-id="${currentOrderId}"]`);
        if (submitBtn) { submitBtn.disabled = true; submitBtn.dataset.origText = submitBtn.textContent; submitBtn.textContent = 'Processing...'; }
        if (tableShipBtn) { tableShipBtn.disabled = true; tableShipBtn.dataset.origText = tableShipBtn.textContent; tableShipBtn.textContent = 'Processing...'; }

        const carrier = form.elements['carrier']?.value || '';
        const trackingNumber = (form.elements['trackingNumber']?.value || '').trim();
        const estimatedDelivery = form.elements['estimatedDelivery']?.value || null;
        const sendEmail = form.elements['sendEmail']?.checked !== false;

        // Validation
        if (!carrier) { alert('Please select a carrier.');
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.origText || submitBtn.textContent; }
          if (tableShipBtn) { tableShipBtn.disabled = false; tableShipBtn.textContent = tableShipBtn.dataset.origText || tableShipBtn.textContent; }
          return; }
        if (!trackingNumber) { alert('Please enter the tracking number.');
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.origText || submitBtn.textContent; }
          if (tableShipBtn) { tableShipBtn.disabled = false; tableShipBtn.textContent = tableShipBtn.dataset.origText || tableShipBtn.textContent; }
          return; }

        const trackingUrl = buildTrackingUrl(carrier, trackingNumber);

        // Update Firestore
        const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
        const orderRef = doc(db, 'orders', currentOrderId);
        await updateDoc(orderRef, {
          status: 'shipped',
          trackingNumber,
          carrier,
          estimatedDelivery: estimatedDelivery || null,
          trackingUrl,
          shippedAt: serverTimestamp()
        });

        // Prepare payload
        const payload = {
          orderId: currentOrderId,
          carrier,
          trackingNumber,
          trackingUrl,
          estimatedDelivery,
          sendEmail
        };

        // Call notification endpoint (best-effort)
        try {
          // Obter ID token do usuário logado e enviar com header Authorization
          const idToken = await auth.currentUser.getIdToken();
          const response = await fetch('/api/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify(Object.assign({ type: 'order-shipped' }, payload))
          });

          // Try to parse JSON safely
          let emailResult = null;
          try {
            emailResult = await response.json();
          } catch (parseErr) {
            console.error('[Dashboard] Failed to parse /api/emails response as JSON:', parseErr);
            emailResult = { error: 'Invalid server response' };
          }

          if (!response.ok) {
            const errorMsg = emailResult?.error || `HTTP ${response.status}`;
            const hint = emailResult?.hint || '';
            console.error('[Dashboard] ❌ Email send failed:', { status: response.status, error: errorMsg, hint });

            if (window.toast) {
              window.toast.error(`Email failed: ${errorMsg}${hint ? '. ' + hint : ''}`);
            } else {
              alert(`Failed to send email: ${errorMsg}\n${hint}`);
            }

            console.warn('[Dashboard] ⚠️ Continuing despite email failure...');

            const proceed = confirm(
              'Email notification failed to send.\n\n' +
              `Error: ${errorMsg}\n\n` +
              'Do you still want to mark this order as shipped?'
            );

            if (!proceed) {
              // restore buttons
              if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.origText || submitBtn.textContent; }
              if (tableShipBtn) { tableShipBtn.disabled = false; tableShipBtn.textContent = tableShipBtn.dataset.origText || tableShipBtn.textContent; }
              return; // Cancela toda operação
            }
          } else {
            console.log('[Dashboard] ✅ Email sent successfully', emailResult);
            if (window.toast) window.toast.success('Shipping notification sent!');
          }

          // Continue: update UI and reload data
          // Recarregar lista em background (não fecha modal)
          await loadDashboard();

          // Update table button to final state if present
          if (tableShipBtn) { tableShipBtn.textContent = 'Shipped'; tableShipBtn.disabled = true; }

          // Clear form and hide
          if (shippingFormContainer) shippingFormContainer.style.display = 'none';
          if (showBtn) showBtn.style.display = '';
          if (shippingActions) shippingActions.style.display = 'none';

          // Atualizar dados do modal sem fechar: reobter pedido atualizado e atualizar status
          const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
          const updatedOrderRef = doc(db, 'orders', currentOrderId);
          const updatedSnap = await getDoc(updatedOrderRef);
          if (updatedSnap.exists()) {
            const updatedOrder = updatedSnap.data();
            const statusElement = document.querySelector('.order-status');
            if (statusElement) {
              statusElement.textContent = 'shipped';
              statusElement.className = 'order-status status-badge status-shipped';
              statusElement.style.background = '#10b981';
              statusElement.style.color = '#ffffff';
              statusElement.style.padding = '4px 8px';
              statusElement.style.borderRadius = '6px';
            }
          }

        } catch (err) {
          console.error('Shipping notification failed:', err);
          try { if (window.toast) window.toast.error('⚠️ Email failed to send, but order was updated'); } catch(e) {}
          // reload list to reflect update
          await loadDashboard();
          // hide form for consistency
          if (shippingFormContainer) shippingFormContainer.style.display = 'none';
          if (showBtn) showBtn.style.display = '';
          if (shippingActions) shippingActions.style.display = 'none';
          // restore table button to allow retry if needed
          if (tableShipBtn) { tableShipBtn.disabled = false; tableShipBtn.textContent = tableShipBtn.dataset.origText || 'Mark as Shipped'; }
        }

      } catch (err) {
        console.error('Failed to mark as shipped:', err);
        alert('Could not update order status: ' + (err.message || 'Unknown error'));
        // restore buttons
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.origText || submitBtn.textContent; }
        if (tableShipBtn) { tableShipBtn.disabled = false; tableShipBtn.textContent = tableShipBtn.dataset.origText || tableShipBtn.textContent; }
      }
    };

  } catch (err) {
    console.error('markAsShipped error:', err);
    alert('Error opening shipping form: ' + (err.message || 'Unknown error'));
  }
};

window.quickShip = async function(orderId) {
  currentOrderId = orderId;
  await window.markAsShipped();
};

window.closeModal = function() {
  document.getElementById('order-modal').style.display = 'none';
  currentOrderId = null;
};

document.getElementById('status-filter')?.addEventListener('change', (e) => {
  // When changing filter, reset pagination and load first page
  loadOrders(e.target.value, true).catch(err => console.error(err));
});

function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  
  try {
    let date;
    
    // Firestore Timestamp (tem toDate())
    if (timestamp && typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } 
    // Objeto com seconds (Firebase Admin ou plain object)
    else if (timestamp && timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    }
    // String ou número
    else {
      date = new Date(timestamp);
    }
    
    // Verifica validade
    if (!date || isNaN(date.getTime())) {
      return 'N/A';
    }
    
    // Formata para Irlanda
    return date.toLocaleDateString('en-IE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    console.error('[formatDate] Error:', e);
    return 'N/A';
  }
}

function translateStatus(status) {
  const t = { pending: 'Pending', shipped: 'Shipped', delivered: 'Delivered' };
  return t[status] || status;

}

// ────────── Delegated table click handler (attach once) ──────────
function handleOrderTableClick(e) {
    const btn = e.target.closest('button');
    const row = e.target.closest('tr.order-row');

    if (btn) {
      const orderId = btn.dataset.orderId;
      if (!orderId) return;
      e.stopPropagation();
      if (btn.classList.contains('btn-view')) return window.viewOrder(orderId);
      if (btn.classList.contains('btn-ship')) return window.quickShip(orderId);
      return;
    }

    if (!row) return;
    if (window.innerWidth >= 768) return;

    // Close other expanded rows
    document.querySelectorAll('.order-row.expanded').forEach(r => {
      if (r !== row) r.classList.remove('expanded');
    });

    row.classList.toggle('expanded');
  }

  function initDashboardListeners() {
    const tbody = document.getElementById('orders-tbody');
    if (!tbody) return;
    // Ensure we don't double-attach
    try { tbody.removeEventListener('click', handleOrderTableClick); } catch (e) { /* ignore */ }
    tbody.addEventListener('click', handleOrderTableClick);
    // Load more button
    const loadMoreBtn = document.getElementById('loadMoreOrdersBtn');
    if (loadMoreBtn) {
      try { loadMoreBtn.removeEventListener('click', loadMoreOrders); } catch (e) {}
      loadMoreBtn.addEventListener('click', (e) => { e.preventDefault(); loadMoreOrders(); });
    }
  }


// Configure logout button to use async handler instead of relying on inline onclick
document.addEventListener('DOMContentLoaded', () => {
  (async () => {
    try {
      // Ensure admin check happens early to avoid flashes of unauthorised UI
      await requireAdmin();
      // If this page contains the orders table, initialize dashboard
      if (document.getElementById('orders-tbody')) {
        loadDashboard().catch(err => console.error('Dashboard init error', err));
      }
    } catch (e) {
      console.warn('Admin check failed or user not admin', e);
    }
  })();
  const exitBtn = document.getElementById('exitDashboardBtn');
  if (exitBtn) {
    exitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = '/';
    });
  }

  // Remove remaining inline onclick handlers safely and reattach needed behaviors
  try {
    document.querySelectorAll('[onclick]').forEach(el => {
      const handler = el.getAttribute('onclick') || '';
      // If it referenced closeModal, reattach equivalent listener
      if (handler.includes('window.closeModal')) {
        try { el.removeAttribute('onclick'); } catch (e) {}
        el.addEventListener('click', (ev) => { ev.preventDefault(); try { window.closeModal(); } catch (e) {} });
      } else {
        // Remove other inline handlers to be CSP-safe
        try { el.removeAttribute('onclick'); } catch (e) {}
      }
    });
  } catch (e) { console.warn('Failed to sanitize inline handlers', e); }
});
