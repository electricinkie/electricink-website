// ========================================
// GLOBAL CART SYSTEM - ELECTRIC INK IE
// ========================================

(function() {
  'use strict';

  const CART_KEY = 'electricink_cart';

  // ────────── Get Cart ──────────
  function getCart() {
    try {
      const stored = localStorage.getItem(CART_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading cart:', error);
      return [];
    }
  }

  // ────────── Save Cart ──────────
  function saveCart(cart) {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      updateCartCount();
      return true;
    } catch (error) {
      console.error('Error saving cart:', error);
      return false;
    }
  }

  // ────────── Add Item to Cart ──────────
  function addItem(item) {
    // Validação
    if (!item || !item.id || !item.name || !item.price) {
      console.error('Invalid item:', item);
      return false;
    }

    const cart = getCart();
    
    // Verifica se item já existe (mesmo id + variant)
    const existingIndex = cart.findIndex(i => i.id === item.id);
    
    if (existingIndex !== -1) {
      // Item já existe - aumenta quantidade
      cart[existingIndex].quantity += 1;
    } else {
      // Item novo - adiciona ao cart
      cart.push({
        id: item.id,
        name: item.name,
        price: item.price,
        image: item.image || '/images/placeholder.jpg',
        variant: item.variant || null,
        stripe_price_id: item.stripe_price_id || null,
        quantity: 1
      });
    }
    
    // Salva
    if (saveCart(cart)) {
      showToast(`${item.name} added to cart!`);
      return true;
    }
    
    return false;
  }

  // ────────── Update Cart Count ──────────
  function updateCartCount() {
    const cart = getCart();
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    
    // Atualiza todos os elementos com classe 'cart-count'
    document.querySelectorAll('.cart-count, .sqs-cart-quantity').forEach(el => {
      el.textContent = totalItems;
    });
    
    // Atualiza header cart icon (se existir)
    const cartIcon = document.querySelector('.header-cart');
    if (cartIcon) {
      if (totalItems > 0) {
        cartIcon.classList.add('has-items');
      } else {
        cartIcon.classList.remove('has-items');
      }
    }
  }

  // ────────── Toast Notification ──────────
  function showToast(message) {
    // Remove toast anterior se existir
    const oldToast = document.querySelector('.cart-toast');
    if (oldToast) {
      oldToast.remove();
    }
    
    // Cria toast
    const toast = document.createElement('div');
    toast.className = 'cart-toast';
    toast.innerHTML = `
      <div class="cart-toast-content">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="#43BDAB" stroke-width="2"/>
          <path d="M6 10l3 3 5-6" stroke="#43BDAB" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span>${message}</span>
      </div>
    `;
    
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove após 3s
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ────────── Get Cart Count ──────────
  function getCartCount() {
    const cart = getCart();
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }

  // ────────── Initialize ──────────
  function init() {
    // Atualiza count ao carregar
    updateCartCount();
  }

  // ────────── Export to Window ──────────
  window.cart = {
    addItem,
    getCart,
    getCartCount,
    updateCartCount
  };

  // ────────── Auto Initialize ──────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
