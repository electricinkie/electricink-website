// ========================================
// SUCCESS PAGE - ORDER CONFIRMATION
// ========================================

import { INTERNAL_API_URL } from './constants.js';

(function() {
  'use strict';

  function escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

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
    
    localStorage.removeItem('electricink_last_order');
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
          <img src="${escHtml(item.image || '/images/placeholder.jpg')}" alt="${escHtml(item.name)}">
        </div>
        <div class="order-item-info">
          <div class="order-item-name">${escHtml(item.name)}</div>
          ${item.variant ? `<div class="order-item-variant">${escHtml(item.variant)}</div>` : ''}
          <div class="order-item-qty">Quantity: ${escHtml(String(item.quantity))}</div>
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
    if (typeof fbq === 'function') {
      fbq('track', 'Purchase', {
        currency: 'EUR',
        value: t.total || 0,
        transaction_id: paymentIntentId
      });
    }
  }

  // ────────── Render Shipping Address ──────────
  const shippingContainer = document.getElementById('shippingAddress');
  
  if (orderData.shipping) {
    const s = orderData.shipping;
    shippingContainer.innerHTML = `
      <p style="margin: 0; line-height: 1.6; font-family: 'Montserrat', sans-serif; font-size: 14px; color: #666;">
        ${escHtml(s.firstName)} ${escHtml(s.lastName)}<br>
        ${escHtml(s.address)}<br>
        ${s.address2 ? escHtml(s.address2) + '<br>' : ''}
        ${escHtml(s.city)}, ${escHtml(s.postalCode)}<br>
        ${escHtml(s.country)}<br>
        ${escHtml(s.phone)}
      </p>
    `;
  }

  // ────────── Render Customer Email ──────────
  if (orderData.email) {
    document.getElementById('customerEmail').textContent = escHtml(orderData.email);
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
      fetch('/api/abandoned-cart-convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: orderData.email })
      }).catch(() => {});
    }
  } catch {}

  localStorage.removeItem('electricink_cart');
  localStorage.removeItem('electricink_last_order');

  // Atualiza cart count no header (se função existir)
  if (window.cart && window.cart.updateCartCount) {
    window.cart.updateCartCount();
  }

  // ────────── Success Toast ──────────
  setTimeout(() => {
    if (window.toast) {
      window.toast.success('Order confirmed! Check your email for details.', 5000);
    }
  }, 500);

})();
