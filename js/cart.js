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

    summarySubtotal.textContent = `€${totals.subtotal.toFixed(2)}`;
    summaryVAT.textContent = `€${totals.vat.toFixed(2)}`;
    summaryTotal.textContent = `€${totals.total.toFixed(2)}`;

    // Progress bar — show nearest milestone
    const progressEl = document.getElementById('cartProgressBar');
    const progressTextEl = document.getElementById('cartProgressText');
    const progressFillEl = document.getElementById('cartProgressFill');
    if (!progressEl || !progressTextEl || !progressFillEl) return;

    const sub = totals.subtotal;
    const milestones = [
      { threshold: 50,  label: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg> Add €{gap} more to activate your referral bonus' },
      { threshold: 120, label: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> Add €{gap} more for free shipping' },
      { threshold: 150, label: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Add €{gap} more to get free shipping!' },
    ];

    const next = milestones.find(m => sub < m.threshold);
    if (next) {
      const gap = (next.threshold - sub).toFixed(2);
      const pct = Math.min(100, Math.round((sub / next.threshold) * 100));
      progressTextEl.innerHTML = next.label.replace('{gap}', `€${gap}`);
      progressFillEl.style.width = `${pct}%`;
      progressEl.style.display = 'block';
    } else {
      progressEl.style.display = 'none';
    }
  }

  // ────────── Update Quantity ──────────
  function updateQuantity(itemId, change) {
    const item = cart.find(i => i.id === itemId);
    if (!item) return;
    
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
      message: `Remove ${item.name} from cart?`,
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
