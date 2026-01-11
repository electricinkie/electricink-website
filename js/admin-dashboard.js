import { initFirebase } from './firebase-config.js';
import { requireAdmin } from './admin-check.js';
import { logout } from './auth.js';

const { auth, db } = await initFirebase();
let currentOrderId = null;

// Load dashboard on DOM ready
/*
document.addEventListener('DOMContentLoaded', () => {
  loadDashboard().catch(err => console.error('Dashboard init error', err));
});
*/

export async function loadDashboard() {
  const user = auth.currentUser;
  if (!user) return window.location.href = '/';

  document.getElementById('admin-name').textContent = user.displayName || user.email;
  await loadStats();
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
      row.innerHTML = `
      <td><strong>${docSnap.id}</strong></td>
      <td>
        ${order.customerName || order.customerEmail || ''}
        ${order.userId ? `<div class="small muted">UID: ${order.userId}</div>` : ''}
      </td>
      <td>${formatDate(order.createdAt)}</td>
      <td>€${Number(order.total || 0).toFixed(2)}</td>
      <td><span class="status-badge status-${order.status}">${translateStatus(order.status)}</span></td>
      <td>
        <button onclick="window.viewOrder('${docSnap.id}')" class="btn-sm">Ver</button>
        ${order.status === 'pending' ? `<button onclick="window.quickShip('${docSnap.id}')" class="btn-sm btn-success">Enviar</button>` : ''}
      </td>
    `;
      tbody.appendChild(row);
    });
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
      <p><strong>Status:</strong> ${translateStatus(order.status)}</p>
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
};

window.markAsShipped = async function() {
  if (!currentOrderId) return;
  if (!confirm('Marcar pedido como enviado?')) return;
  try {
    // Get Firebase ID token to authenticate to server endpoint
    const token = await auth.currentUser.getIdToken();

    // Call serverless API which uses OrderManager.updateStatus and creates order-events
    const resp = await fetch('/api/update-order-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ orderId: currentOrderId, status: 'shipped' })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update order status');
    }

    // trigger backend email (unchanged) — server will have recorded the event
    try {
      await fetch('/api/send-shipping-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: currentOrderId })
      });
    } catch (e) { console.warn('Email send failed', e); }

    alert('Pedido marcado como enviado!');
    window.closeModal();
    await loadDashboard();
  } catch (err) {
    console.error('Failed to mark as shipped', err);
    alert('Não foi possível atualizar o status do pedido: ' + (err.message || 'Erro desconhecido'));
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
}

// Configure logout button to use async handler instead of relying on inline onclick
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    try { logoutBtn.removeAttribute('onclick'); } catch (e) {}
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await logout();
        window.location.href = '/';
      } catch (err) {
        console.error('Logout error:', err);
        window.location.href = '/';
      }
    });
  }
});
