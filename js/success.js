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
      fetch(`${INTERNAL_API_URL}/api/abandoned-cart/convert`, {
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

  // ────────── Ink Points Summary ──────────
  if (orderData.email) {
    setTimeout(async () => {
      try {
        const res = await fetch(
          `${INTERNAL_API_URL}/api/loyalty/points-summary?email=${encodeURIComponent(orderData.email)}`,
          { headers: { 'x-crm-secret': window.EI_CRM_SECRET || '' } }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!data.found) return;

        const card = document.getElementById('inkPointsCard');
        const content = document.getElementById('inkPointsContent');
        if (!card || !content) return;

        const levelLabels = {
          fresh_ink:   'Fresh Ink',
          steady_hand: 'Steady Hand',
          raw_talent:  'Raw Talent',
          nine_lives:  'Nine Lives',
          legend:      'Legend',
          black_cat:   'Black Cat',
        };

        const label = levelLabels[data.level] || data.level;
        const events = data.events || [];

        // Build event rows from backend data
        const eventIcons = {
          purchase:     `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="flex-shrink:0"><path d="M10 16V4M4 10l6-6 6 6" stroke="#43BDAB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
          welcome_bonus:`<svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="flex-shrink:0"><path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.3L10 14.3l-4.8 2.5.9-5.3L2.2 7.7l5.4-.8L10 2z" stroke="#FFA300" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
          mission:      `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="flex-shrink:0"><circle cx="10" cy="10" r="9" stroke="#0033C4" stroke-width="2"/><path d="M6 10l3 3 5-6" stroke="#0033C4" stroke-width="2" stroke-linecap="round"/></svg>`,
          badge:        `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="flex-shrink:0"><path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.3L10 14.3l-4.8 2.5.9-5.3L2.2 7.7l5.4-.8L10 2z" stroke="#FFA300" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
          level_up:     `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="flex-shrink:0"><path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.3L10 14.3l-4.8 2.5.9-5.3L2.2 7.7l5.4-.8L10 2z" stroke="#FFA300" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
          fallback:     `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="flex-shrink:0"><path d="M10 16V4M4 10l6-6 6 6" stroke="#43BDAB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        };

        const eventRows = events.map(e => `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0;
                      border-bottom:1px solid #f0f0f0;">
            <span style="display:flex;align-items:center;flex-shrink:0;">${eventIcons[e.type] || eventIcons.fallback}</span>
            <span style="font-family:'Montserrat',sans-serif;font-size:12px;color:#333;
                         font-weight:${e.type === 'level_up' ? '700' : '500'};">
              ${e.label}
            </span>
          </div>
        `).join('');

        content.innerHTML = `
          ${eventRows || `
            <div style="font-family:'Montserrat',sans-serif;font-size:13px;color:#444;">
              Catokens will be added to your account shortly.
            </div>
          `}
          <div style="display:flex;justify-content:space-between;align-items:center;
                      margin-top:12px;padding-top:10px;border-top:1px solid #e8e8e8;">
            <span style="font-family:'Montserrat',sans-serif;font-size:12px;color:#999;">
              Balance: <strong style="color:#111;">${data.points.toLocaleString()} Catokens</strong>
              · Rank: <strong style="color:#111;">${label}</strong>
            </span>
            <a href="/account.html"
               style="font-family:'Montserrat',sans-serif;font-size:11px;
                      color:#43BDAB;text-decoration:none;font-weight:700;
                      letter-spacing:0.04em;white-space:nowrap;">
              View rewards →
            </a>
          </div>
        `;
        card.style.display = '';

        // Toast for each significant event
        const purchaseEvent = events.find(e => e.type === 'purchase');
        const levelUpEvent  = events.find(e => e.type === 'level_up');
        const missionEvents = events.filter(e => e.type === 'mission');
        const badgeEvents   = events.filter(e => e.type === 'badge');

        const _svgArrow = `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="display:inline-block;vertical-align:middle;margin-right:6px;flex-shrink:0"><path d="M10 16V4M4 10l6-6 6 6" stroke="#43BDAB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        const _svgStar  = `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="display:inline-block;vertical-align:middle;margin-right:6px;flex-shrink:0"><path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.3L10 14.3l-4.8 2.5.9-5.3L2.2 7.7l5.4-.8L10 2z" stroke="#FFA300" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
        const _svgCheck = `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="display:inline-block;vertical-align:middle;margin-right:6px;flex-shrink:0"><circle cx="10" cy="10" r="9" stroke="#0033C4" stroke-width="2"/><path d="M6 10l3 3 5-6" stroke="#0033C4" stroke-width="2" stroke-linecap="round"/></svg>`;

        if (window.toast) {
          if (purchaseEvent) {
            window.toast.success(`${_svgArrow} +${purchaseEvent.catokens.toLocaleString()} Catokens earned`, 5000);
          }
          if (levelUpEvent) {
            setTimeout(() => window.toast.success(`${_svgStar} ${levelUpEvent.label}`, 6000), 1500);
          }
          for (let i = 0; i < missionEvents.length; i++) {
            setTimeout(() => window.toast.success(`${_svgCheck} ${missionEvents[i].label}`, 5000), 2000 + i * 1000);
          }
          for (let i = 0; i < badgeEvents.length; i++) {
            setTimeout(() => window.toast.success(`${_svgStar} ${badgeEvents[i].label}`, 5000), 3000 + i * 1000);
          }
        }
      } catch (e) {
        console.warn('[InkPoints] points-summary fetch failed', e);
      }
    }, 1500);
  }

})();
