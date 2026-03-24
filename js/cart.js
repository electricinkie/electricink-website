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
    // 🔧 FIX: Shipping line removida - não existe mais no cart
    summaryVAT.textContent = `€${totals.vat.toFixed(2)}`;
    summaryTotal.textContent = `€${totals.total.toFixed(2)}`;
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
