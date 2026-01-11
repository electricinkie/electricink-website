import { initFirebase, authReady } from './firebase-config.js';
import { requireAdmin } from './admin-check.js';

const { auth, db } = await initFirebase();
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
  let user = auth.currentUser;
  if (!user) {
    try {
      // Wait briefly for auth restoration if transiently null
      await Promise.race([authReady, new Promise(res => setTimeout(() => res(null), 5000))]);
    } catch (e) {}
    user = auth.currentUser;
  }
  if (!user) return window.location.href = '/';

  document.getElementById('admin-name').textContent = user.displayName || user.email;
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

    // todays sales
    const today = new Date(); today.setHours(0,0,0,0);
    const todayTs = Timestamp.fromDate(today);
    const todaySnap = await getDocs(query(ordersCol, where('createdAt', '>=', todayTs)));
    let todaySales = 0;
    todaySnap.forEach(d => { const o = d.data(); todaySales += Number(o.total || 0); });
    document.getElementById('today-sales').textContent = `€${todaySales.toFixed(2)}`;
  } catch (err) {
    console.error('Erro ao carregar estatísticas:', err);
    try { document.getElementById('total-orders').textContent = '—'; } catch (e) {}
    try { document.getElementById('pending-count').textContent = '—'; } catch (e) {}
    try { document.getElementById('today-sales').textContent = '—'; } catch (e) {}
  }
}

async function loadOrders(status = 'all') {
  const tbody = document.getElementById('orders-tbody');
  tbody.innerHTML = '<tr><td colspan="6">Carregando...</td></tr>';
  try {
    const { collection, getDocs, query, where, orderBy, limit: _limit } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
    let q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), _limit(50));
    if (status !== 'all') q = query(collection(db, 'orders'), where('status', '==', status), orderBy('createdAt', 'desc'), _limit(50));

    const snap = await getDocs(q);
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6">Nenhum pedido encontrado</td></tr>';
      return;
    }

    tbody.innerHTML = '';
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
      <td data-label="Date">${formatDate(order.createdAt)}</td>
      <td data-label="Total">€${Number(order.total || 0).toFixed(2)}</td>
      <td data-label="Status"><span class="status-badge status-${order.status}">${translateStatus(order.status)}</span></td>
      <td data-label="Actions">
        <button class="btn-sm btn-view" data-order-id="${docSnap.id}">Ver</button>
        ${order.status === 'pending' ? `<button class="btn-sm btn-success btn-ship" data-order-id="${docSnap.id}">Enviar</button>` : ''}
      </td>
    `;

      // (per-row listeners removed - handled by delegated tbody listener below)

      tbody.appendChild(row);
    });

    // Note: delegated click listener is attached globally once via initDashboardListeners()
  } catch (err) {
    console.error('Erro ao carregar pedidos:', err);
    tbody.innerHTML = `<tr><td colspan=\"6\">Erro ao carregar pedidos: ${err?.message || 'Ver console'}</td></tr>`;
  }
}

window.viewOrder = async function(orderId) {
  const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
  const snap = await getDoc(doc(db, 'orders', orderId));
  if (!snap.exists()) return alert('Pedido não encontrado');
  const order = snap.data();
  currentOrderId = orderId;

    const detailsHtml = `
    <div class="order-info">
      <p><strong>Order ID:</strong> ${orderId}</p>
      <p><strong>Cliente:</strong> ${order.customerName || ''}</p>
      <p><strong>UID:</strong> ${order.userId || 'guest'}</p>
      <p><strong>Email:</strong> ${order.customerEmail || ''}</p>
      <p><strong>Data:</strong> ${formatDate(order.createdAt)}</p>
      <p><strong>Status:</strong> <span class="order-status status-badge status-${order.status}">${translateStatus(order.status)}</span></p>
      <p><strong>Total:</strong> €${Number(order.total || 0).toFixed(2)}</p>
    </div>
    <h3>Items:</h3>
    <ul class="order-items">
      ${(order.items || []).map(i => `<li>${i.name} x${i.quantity} - €${Number(i.price * i.quantity).toFixed(2)}</li>`).join('')}
    </ul>
    <h3>Endereço de Envio:</h3>
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
      try {
        const carrier = form.elements['carrier']?.value || '';
        const trackingNumber = (form.elements['trackingNumber']?.value || '').trim();
        const estimatedDelivery = form.elements['estimatedDelivery']?.value || null;
        const sendEmail = form.elements['sendEmail']?.checked !== false;

        // Validation
        if (!carrier) { alert('Por favor selecione a transportadora.'); return; }
        if (!trackingNumber) { alert('Por favor insira o número de rastreio.'); return; }

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
          const response = await fetch('/api/send-shipping-notification', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            throw new Error('Failed to send shipping notification');
          }

          // Mostrar toast de sucesso
          window.toast.success('✅ Order marked as shipped! Email sent to customer.');

          // Recarregar lista em background (não fecha modal)
          await loadDashboard();

          // Limpar formulário e esconder
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
          window.toast.error('⚠️ Email failed to send, but order was updated');
          // Ainda recarrega a lista em background
          await loadDashboard();
          // esconder formulário para manter consistência do UI
          if (shippingFormContainer) shippingFormContainer.style.display = 'none';
          if (showBtn) showBtn.style.display = '';
          if (shippingActions) shippingActions.style.display = 'none';
        }

      } catch (err) {
        console.error('Failed to mark as shipped:', err);
        alert('Não foi possível atualizar o status do pedido: ' + (err.message || 'Erro desconhecido'));
      }
    };

  } catch (err) {
    console.error('markAsShipped error:', err);
    alert('Erro ao abrir formulário de envio: ' + (err.message || 'Erro desconhecido'));
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
  loadOrders(e.target.value).catch(err => console.error(err));
});

function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  
  try {
    // Se é Firestore Timestamp com método toDate()
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      return timestamp.toDate().toLocaleString('pt-PT', { 
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
    
    // Se é plain object Firestore { seconds, nanoseconds } ou { _seconds, _nanoseconds }
    const seconds = timestamp.seconds || timestamp._seconds;
    if (seconds && typeof seconds === 'number') {
      return new Date(seconds * 1000).toLocaleString('pt-PT', { 
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
    
    // Se é timestamp em milissegundos (number)
    if (typeof timestamp === 'number') {
      return new Date(timestamp).toLocaleString('pt-PT', { 
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
    
    // Se é string ISO ou Date
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date.toLocaleString('pt-PT', { 
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
    
    // Fallback
    console.warn('Formato de timestamp não reconhecido:', timestamp);
    return 'Data inválida';
  } catch (e) {
    console.error('Erro ao formatar data:', e, timestamp);
    return 'N/A';
  }
}

function translateStatus(status) {
  const t = { pending: 'Pendente', shipped: 'Enviado', delivered: 'Entregue' };
  return t[status] || status;

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
  }
}

// Configure logout button to use async handler instead of relying on inline onclick
document.addEventListener('DOMContentLoaded', () => {
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
