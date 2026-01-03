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
    window.location.href = '/';
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
    document.getElementById('orderSubtotal').textContent = `€${orderData.totals.subtotal.toFixed(2)}`;
    document.getElementById('orderShipping').textContent = orderData.totals.shippingText || 'FREE';
    document.getElementById('orderVAT').textContent = `€${orderData.totals.vat.toFixed(2)}`;
    document.getElementById('orderTotal').textContent = `€${orderData.totals.total.toFixed(2)}`;
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

  // ────────── Clear Cart ──────────
  localStorage.removeItem('electricink_cart');
  
  // Atualiza cart count no header (se função existir)
  if (window.cart && window.cart.updateCartCount) {
    window.cart.updateCartCount();
  }

})();
