// ========================================
// CART.JS - SHOPPING CART LOGIC
// ========================================

import { FREE_SHIPPING_THRESHOLD } from './constants.js';

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

  // ────────── Constants ──────────
  const CART_KEY = 'electricink_cart';
  // 🔧 FIX: SHIPPING_COST movido para checkout.js (não usado no cart)
  
  // ────────── DOM Elements ──────────
  const cartEmpty = document.getElementById('cartEmpty');
  const cartItemsContainer = document.getElementById('cartItems');
  const summarySubtotal = document.getElementById('summarySubtotal');
  const summaryVAT = document.getElementById('summaryVAT');
  const summaryTotal = document.getElementById('summaryTotal');
  const checkoutBtn = document.getElementById('checkoutBtn');

  // ────────── Cart State ──────────
  let cart = [];
  // Black Cat Friday discount in cents for the cart as it is now. Display only: the server decides the price.
  // Any failure leaves it at 0 and the summary shows exactly the subtotal, as before.
  let campaignDiscountCents = 0;
  let campaignSeq = 0;
  // Stock hints (display only, the server still checks): limit per item id, null = unknown = never blocks.
  let stockLimitsById = {};
  let stockSeq = 0;

  // ────────── Load Cart from localStorage ──────────
  function loadCart() {
    try {
      const stored = localStorage.getItem(CART_KEY);
      cart = stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading cart:', error);
      cart = [];
    }
  }

  // ────────── Save Cart to localStorage ──────────
  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      
      // Notify global cart system if available, otherwise dispatch event
      if (window.cart && typeof window.cart.updateCartCount === 'function') {
        try { window.cart.updateCartCount(); } catch (e) { /* ignore */ }
      } else {
        // backward-compatible: dispatch event listeners that headers subscribe to
        window.dispatchEvent(new Event('cart-updated'));
      }
    } catch (error) {
      console.error('Error saving cart:', error);
    }
  }

  // ────────── Calculate Totals ──────────
  function calculateTotals() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // 🔧 FIX: Shipping removido do cart - calculado apenas no checkout
    // VAT is informational (prices include VAT). Calculate VAT portion by reverse-rate.
    // Do NOT add VAT on top of the subtotal — total remains the subtotal here.
    const total = subtotal;
    const vat = subtotal - (subtotal / 1.23);
    
    return {
      subtotal,
      vat,
      total
    };
  }

  // ────────── Update Summary ──────────
  function updateSummary() {
    const totals = calculateTotals();

    // Total with the campaign discount (never below what the server charges: a discount above the subtotal is ignored).
    const subtotalCents = Math.round(totals.subtotal * 100);
    const discountCents = (Number.isInteger(campaignDiscountCents) && campaignDiscountCents > 0 && campaignDiscountCents <= subtotalCents) ? campaignDiscountCents : 0;
    const totalCents = subtotalCents - discountCents;
    const campaignLine = document.getElementById('campaignLine');
    const campaignAmount = document.getElementById('summaryCampaign');
    if (campaignLine && campaignAmount) {
      campaignAmount.textContent = `−€${(discountCents / 100).toFixed(2)}`;
      campaignLine.style.display = discountCents > 0 ? 'flex' : 'none';
    }

    summarySubtotal.textContent = `€${totals.subtotal.toFixed(2)}`;
    summaryVAT.textContent = `€${(discountCents > 0 ? (totalCents / 100) - (totalCents / 100) / 1.23 : totals.vat).toFixed(2)}`;
    summaryTotal.textContent = `€${(discountCents > 0 ? totalCents / 100 : totals.total).toFixed(2)}`;

    // Progress bar — show nearest milestone
    const progressEl = document.getElementById('cartProgressBar');
    const progressTextEl = document.getElementById('cartProgressText');
    const progressFillEl = document.getElementById('cartProgressFill');
    if (!progressEl || !progressTextEl || !progressFillEl) return;

    // Free-shipping progress: the copy changes with how much is left, and the
    // bar stays visible once the threshold is reached. Compared before any
    // discount, like the checkout and the server.
    const sub = totals.subtotal;
    const shipBands = [
      { above: 100, text: `Free shipping on orders over €${FREE_SHIPPING_THRESHOLD} (incl. VAT). €{gap} to go.` },
      { above: 50, text: 'You’re on your way: add €{gap} more for free shipping.' },
      { above: 20, text: 'Getting close: just €{gap} more for free shipping.', close: true },
      { above: 0, text: 'Almost there: only €{gap} more for free shipping.', close: true },
    ];
    const truckIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>';
    const checkIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
    const progressNoteEl = document.getElementById('cartProgressNote');

    const gap = FREE_SHIPPING_THRESHOLD - sub;
    const band = shipBands.find(b => gap > b.above);
    if (band) {
      const pct = Math.min(100, Math.floor((sub / FREE_SHIPPING_THRESHOLD) * 100));
      progressTextEl.innerHTML = `${truckIcon}<span>${band.text.replace('{gap}', gap.toFixed(2))}</span>`;
      progressFillEl.style.width = `${pct}%`;
      progressEl.classList.toggle('is-close', !!band.close);
      progressEl.classList.remove('is-unlocked');
      if (progressNoteEl) progressNoteEl.hidden = true;
    } else {
      progressTextEl.innerHTML = `${checkIcon}<span>Free shipping unlocked.</span>`;
      progressFillEl.style.width = '100%';
      progressEl.classList.remove('is-close');
      progressEl.classList.add('is-unlocked');
      if (progressNoteEl) progressNoteEl.hidden = false;
    }
    progressEl.style.display = 'block';
  }

  // ────────── Black Cat Friday discount (display only) ──────────
  // js/cart-drawer.js (loaded on this page) does the calculation with lib/campaign.js; the cart is re-checked
  // after every change, and until the answer arrives the summary shows the plain subtotal.
  async function refreshCampaign() {
    const seq = ++campaignSeq;
    campaignDiscountCents = 0;
    try {
      if (cart.length === 0 || !window.cartDrawer || typeof window.cartDrawer.campaignDiscountCents !== 'function') return;
      const cents = await window.cartDrawer.campaignDiscountCents(cart);
      if (seq !== campaignSeq) return;
      campaignDiscountCents = cents;
      updateSummary();
    } catch (e) { /* summary stays as it is */ }
  }

  // Disables "+" and says "Only N left" when the cart already holds all the stock the shop can see.
  async function refreshStock() {
    const seq = ++stockSeq;
    try {
      if (cart.length === 0 || !window.cartDrawer || typeof window.cartDrawer.stockLimits !== 'function') return;
      const limits = await window.cartDrawer.stockLimits(cart);
      if (seq !== stockSeq) return;
      stockLimitsById = limits;
      cart.forEach(item => {
        const limit = limits[item.id] === undefined ? null : limits[item.id];
        const note = window.cartDrawer.stockNote(limit, item.quantity);
        if (!note) return;
        const node = Array.from(cartItemsContainer.querySelectorAll('.cart-item')).find(n => n.dataset.itemId === item.id);
        if (!node) return;
        const plus = node.querySelector('.quantity-btn[data-action="increase"]');
        if (plus) plus.disabled = true;
        const p = document.createElement('p');
        p.className = 'cart-item-stock';
        p.textContent = note;
        const info = node.querySelector('.cart-item-info');
        if (info) info.appendChild(p);
      });
    } catch (e) { /* no hint, "+" works as before */ }
  }

  // ────────── Update Quantity ──────────
  function updateQuantity(itemId, change) {
    const item = cart.find(i => i.id === itemId);
    if (!item) return;
    try {
      const limit = stockLimitsById[itemId] === undefined ? null : stockLimitsById[itemId];
      if (change > 0 && window.cartDrawer && window.cartDrawer.stockNote(limit, item.quantity)) return;
    } catch (e) { /* never block on an error */ }
    
    item.quantity += change;
    
    // Remove se quantidade = 0
    if (item.quantity <= 0) {
      cart = cart.filter(i => i.id !== itemId);
      saveCart();
      renderCart();
      
      // Toast feedback
      if (window.toast) {
        window.toast.success(`${item.name} removed from cart`);
      }
      return;
    }
    
    saveCart();
    renderCart();

    // Directional toast feedback for quantity changes
    if (window.toast) {
      try {
        if (change > 0) {
          window.toast.success(`ADDED: ${item.name}`);
        } else if (change < 0) {
          if (typeof window.toast.removed === 'function') {
            window.toast.removed(`REMOVED: ${item.name}`);
          } else {
            window.toast.info(`REMOVED: ${item.name}`);
          }
        }
      } catch (e) {
        console.warn('Toast failed for updateQuantity', e && e.message);
      }
    }
  }

  // ────────── Remove Item ──────────
  async function removeItem(itemId) {
    const item = cart.find(i => i.id === itemId);
    if (!item) return;
    
    // Modal customizado
    const confirmed = await window.modal.delete({
      title: 'Remove Item',
      message: `Remove ${escHtml(item.name)} from cart?`,
      primaryBtn: 'Remove',
      secondaryBtn: 'Cancel'
    });
    
    if (!confirmed) return;
    
    cart = cart.filter(i => i.id !== itemId);
    saveCart();
    renderCart();
    
    // Toast feedback
    if (window.toast) {
      window.toast.success(`${item.name} removed from cart`);
    }
  }

  // ────────── Render Cart Items ──────────
  function renderCart() {
    // Se carrinho vazio
    if (cart.length === 0) {
      cartEmpty.style.display = 'block';
      cartItemsContainer.style.display = 'none';
      updateSummary();
      refreshCampaign();
      return;
    }
    
    cartEmpty.style.display = 'none';
    cartItemsContainer.style.display = 'block';
    
    // Renderiza items
    cartItemsContainer.innerHTML = cart.map(item => `
      <div class="cart-item" data-item-id="${escHtml(item.id)}">

        <!-- Image -->
        <div class="cart-item-image">
          <img src="${escHtml(item.image || '/images/placeholder.jpg')}" alt="${escHtml(item.name)}">
        </div>

        <!-- Info -->
        <div class="cart-item-info">
          <h3 class="cart-item-name">${escHtml(item.name)}</h3>
          ${item.available_on_request ? `<p class="cart-item-variant" style="color:#f97316;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Order on Request</p>` : ''}
          ${item.variant ? `<p class="cart-item-variant">${escHtml(item.variant)}</p>` : ''}
          <p class="cart-item-price">€${item.price.toFixed(2)}</p>
        </div>

        <!-- Actions -->
        <div class="cart-item-actions">

          <!-- Quantity Controls -->
          <div class="quantity-controls">
            <button class="quantity-btn" data-action="decrease" data-item-id="${escHtml(item.id)}">
              −
            </button>
            <span class="quantity-value">${escHtml(String(item.quantity))}</span>
            <button class="quantity-btn" data-action="increase" data-item-id="${escHtml(item.id)}">
              +
            </button>
          </div>

          <!-- Remove Button -->
          <button class="remove-btn" data-item-id="${escHtml(item.id)}">
            Remove
          </button>

        </div>

      </div>
    `).join('');
    
    // Adiciona event listeners
    addEventListeners();
    
    // Atualiza summary
    updateSummary();
    refreshCampaign();
    refreshStock();
  }

  // ────────── Add Event Listeners ──────────
  function addEventListeners() {
    // Quantity buttons
    document.querySelectorAll('.quantity-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const itemId = this.dataset.itemId;
        const action = this.dataset.action;
        const change = action === 'increase' ? 1 : -1;
        updateQuantity(itemId, change);
      });
    });
    
    // Remove buttons
    document.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const itemId = this.dataset.itemId;
        removeItem(itemId);
      });
    });
  }

  // ────────── Proceed to Checkout ──────────
  checkoutBtn.addEventListener('click', function() {
    if (cart.length === 0) {
      if (window.toast) {
        window.toast.warning('Your cart is empty');
      } else {
        alert('Your cart is empty');
      }
      return;
    }
    
    // Salva totals no localStorage para checkout page
    const totals = calculateTotals();
    localStorage.setItem('electricink_checkout_totals', JSON.stringify(totals));
    
    // Redireciona para checkout
    window.location.href = '/checkout.html';
  });

  // ────────── Initialize ──────────
  loadCart();
  renderCart();
  // cart-drawer.js is a later module on this page: ask again once every module has run.
  if (document.readyState !== 'complete') {
    document.addEventListener('DOMContentLoaded', refreshCampaign);
    document.addEventListener('DOMContentLoaded', refreshStock);
  }

  // ────────── Export para usar em outras páginas ──────────
  window.cartUtils = {
    getCart: () => cart,
    getTotals: calculateTotals,
    clearCart: () => {
      cart = [];
      saveCart();
      renderCart();
    }
  };

})();
