// ========================================
// SUCCESS PAGE - ORDER CONFIRMATION
// ========================================

(function() {
  'use strict';

  // ────────── Get Payment Intent ID from URL ──────────
  const urlParams = new URLSearchParams(window.location.search);
  const paymentIntentId = urlParams.get('payment_intent');
  
  // Redirect se não tiver payment_intent
  if (!paymentIntentId) {
    console.error('No payment_intent in URL');
    
    // Toast antes de redirecionar
    if (window.toast) {
      window.toast.warning('No order found. Redirecting to home...', 2000);
    }
    
    setTimeout(() => {
      window.location.href = '/';
    }, 2000);
    
    return;
  }

  // ────────── Get Order Data from localStorage ──────────
  const orderData = JSON.parse(localStorage.getItem('electricink_last_order') || '{}');
  
  if (!orderData.items || orderData.items.length === 0) {
    console.error('No order data found');
    // Ainda mostra página mas sem items
  }

  // ────────── Render Order Number ──────────
  const orderNumber = paymentIntentId.substring(3, 15).toUpperCase();
  document.getElementById('orderNumber').textContent = `#${orderNumber}`;

  // ────────── Render Order Items ──────────
  const orderItemsContainer = document.getElementById('orderItems');
  
  if (orderData.items && orderData.items.length > 0) {
    orderItemsContainer.innerHTML = orderData.items.map(item => `
      <div class="order-item">
        <div class="order-item-image">
          <img src="${item.image || '/images/placeholder.jpg'}" alt="${item.name}">
        </div>
        <div class="order-item-info">
          <div class="order-item-name">${item.name}</div>
          ${item.variant ? `<div class="order-item-variant">${item.variant}</div>` : ''}
          <div class="order-item-qty">Quantity: ${item.quantity}</div>
        </div>
        <div class="order-item-price">€${(item.price * item.quantity).toFixed(2)}</div>
      </div>
    `).join('');
  }

  // ────────── Render Totals ──────────
  if (orderData.totals) {
    const t = orderData.totals;
    document.getElementById('orderSubtotal').textContent = `€${(t.subtotal || 0).toFixed(2)}`;
    document.getElementById('orderShipping').textContent = t.shippingText || 'FREE';

    const vatEl = document.getElementById('orderVAT');
    if (typeof t.vat === 'number' && Number.isFinite(t.vat)) {
      vatEl.textContent = `€${t.vat.toFixed(2)}`;
    } else {
      vatEl.textContent = 'Included in price';
    }

    document.getElementById('orderTotal').textContent = `€${(t.total || 0).toFixed(2)}`;
  }

  // ────────── Render Shipping Address ──────────
  const shippingContainer = document.getElementById('shippingAddress');
  
  if (orderData.shipping) {
    const s = orderData.shipping;
    shippingContainer.innerHTML = `
      <p style="margin: 0; line-height: 1.6; font-family: 'Montserrat', sans-serif; font-size: 14px; color: #666;">
        ${s.firstName} ${s.lastName}<br>
        ${s.address}<br>
        ${s.address2 ? s.address2 + '<br>' : ''}
        ${s.city}, ${s.postalCode}<br>
        ${s.country}<br>
        ${s.phone}
      </p>
    `;
  }

  // ────────── Render Customer Email ──────────
  if (orderData.email) {
    document.getElementById('customerEmail').textContent = orderData.email;
  }

  // ────────── Render Card Last 4 (se disponível) ──────────
  if (orderData.cardLast4) {
    document.getElementById('cardLast4').textContent = orderData.cardLast4;
  }

  // ────────── Google Analytics — purchase event ──────────
  try {
    if (typeof gtag === 'function' && orderData.items && orderData.totals) {
      gtag('event', 'purchase', {
        transaction_id: orderNumber,
        currency: 'EUR',
        value: orderData.totals.total || 0,
        shipping: orderData.totals.shipping || 0,
        items: orderData.items.map((item, i) => ({
          item_id: item.id || `item_${i}`,
          item_name: item.name,
          price: item.price,
          quantity: item.quantity || 1
        }))
      });
    }
  } catch (e) {
    console.warn('[GA] purchase event failed', e);
  }

  // ────────── Clear Cart ──────────
  // ── Mark abandoned cart as converted ──
  try {
    if (orderData.email) {
      fetch('https://ei-internal-production.up.railway.app/api/abandoned-cart/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: orderData.email })
      }).catch(() => {});
    }
  } catch {}

  localStorage.removeItem('electricink_cart');
  
  // Atualiza cart count no header (se função existir)
  if (window.cart && window.cart.updateCartCount) {
    window.cart.updateCartCount();
  }

  // ────────── Success Toast ──────────
  // Após renderizar tudo, mostrar toast de sucesso
  setTimeout(() => {
    if (window.toast) {
      window.toast.success('Order confirmed! Check your email for details.', 5000);
    }
  }, 500);

})();
