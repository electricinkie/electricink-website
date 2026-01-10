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
      
      // Dispara evento para atualizar header mobile
      window.dispatchEvent(new Event('cart-updated'));
      
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

    // Normalize and require a single canonical Stripe price id field: `stripe_price_id`
    const normalizedPriceId = item.stripe_price_id || item.priceId || item.price_id || (item.stripe && (item.stripe.priceId || item.stripe.price_id)) || null;
    if (!normalizedPriceId) {
      console.error('Missing stripe_price_id for item, refusing to add to cart:', item);
      return false;
    }

    const cart = getCart();
    
    // Verifica se item já existe (mesmo id + variant)
    const existingIndex = cart.findIndex(i => i.id === item.id);
    
    if (existingIndex !== -1) {
      // Item já existe - aumenta quantidade
      cart[existingIndex].quantity += 1;

      // Ensure existing item has normalized stripe_price_id
      if (!cart[existingIndex].stripe_price_id) {
        cart[existingIndex].stripe_price_id = normalizedPriceId;
      }
    } else {
      // Item novo - adiciona ao cart
      cart.push({
        id: item.id,
        name: item.name,
        price: item.price,
        image: item.image || '/images/placeholder.jpg',
        variant: item.variant || null,
        stripe_price_id: normalizedPriceId,
        quantity: 1
      });
    }
    
    // Salva
    if (saveCart(cart)) {
      if (window.toast) {
        window.toast.success(`${item.name} added to cart!`);
      }
      try {
        console.log('[CART_STATE]', cart);
      } catch (e) {
        console.error('Audit log failed (CART_STATE):', e);
      }
      return true;
    }
    
    return false;
  }

  // ────────── Update Cart Count ──────────
  function updateCartCount() {
    const cart = getCart();
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    
    // Update all possible badge selectors used across headers and UI
    const badgeSelectors = [
      '[data-cart-count]',
      '.desktop-cart-count',
      '.cart-count',
      '.menu-cart-count',
      '.sqs-cart-quantity'
    ].join(', ');

    document.querySelectorAll(badgeSelectors).forEach(el => {
      el.textContent = totalItems;
      el.style.display = totalItems > 0 ? 'flex' : 'none';
    });

    // Toggle header icons (desktop and generic header)
    const desktopCart = document.querySelector('.desktop-cart');
    const headerCart = document.querySelector('.header-cart');
    if (desktopCart) desktopCart.classList.toggle('has-items', totalItems > 0);
    if (headerCart) headerCart.classList.toggle('has-items', totalItems > 0);
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

  // ────────── Cross-tab sync via storage events ──────────
  window.addEventListener('storage', (e) => {
    if (e.key === CART_KEY) {
      updateCartCount();
      // ensure other scripts relying on the event run too
      window.dispatchEvent(new Event('cart-updated'));
    }
  });

})();
