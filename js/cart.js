// ========================================
// CART.JS - SHOPPING CART LOGIC
// ========================================

(function() {
  'use strict';

  // ────────── Constants ──────────
  const CART_KEY = 'electricink_cart';
  const FREE_SHIPPING_THRESHOLD = 120; // €120 para frete grátis
  const SHIPPING_COST = 8.50; // €8.50 frete normal
  
  // ────────── DOM Elements ──────────
  const cartEmpty = document.getElementById('cartEmpty');
  const cartItemsContainer = document.getElementById('cartItems');
  const summarySubtotal = document.getElementById('summarySubtotal');
  const summaryShipping = document.getElementById('summaryShipping');
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
      
      // Update header cart count (se existir)
      if (window.updateCartCount) {
        window.updateCartCount();
      }
    } catch (error) {
      console.error('Error saving cart:', error);
    }
  }

  // ────────── Calculate Totals ──────────
  function calculateTotals() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Calcula shipping
    let shipping = 0;
    let shippingText = 'FREE';
    
    if (subtotal > 0 && subtotal < FREE_SHIPPING_THRESHOLD) {
      shipping = SHIPPING_COST;
      shippingText = `€${shipping.toFixed(2)}`;
    }
    
    // Calcula VAT (23% do subtotal)
    const vat = subtotal * 0.23;
    
    // Total = subtotal + shipping + VAT
    const total = subtotal + shipping + vat;
    
    return {
      subtotal,
      shipping,
      shippingText,
      vat,
      total
    };
  }

  // ────────── Update Summary ──────────
  function updateSummary() {
    const totals = calculateTotals();
    
    summarySubtotal.textContent = `€${totals.subtotal.toFixed(2)}`;
    summaryShipping.textContent = totals.shippingText;
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
      <div class="cart-item" data-item-id="${item.id}">
        
        <!-- Image -->
        <div class="cart-item-image">
          <img src="${item.image || '/images/placeholder.jpg'}" alt="${item.name}">
        </div>
        
        <!-- Info -->
        <div class="cart-item-info">
          <h3 class="cart-item-name">${item.name}</h3>
          ${item.variant ? `<p class="cart-item-variant">${item.variant}</p>` : ''}
          <p class="cart-item-price">€${item.price.toFixed(2)}</p>
        </div>
        
        <!-- Actions -->
        <div class="cart-item-actions">
          
          <!-- Quantity Controls -->
          <div class="quantity-controls">
            <button class="quantity-btn" data-action="decrease" data-item-id="${item.id}">
              −
            </button>
            <span class="quantity-value">${item.quantity}</span>
            <button class="quantity-btn" data-action="increase" data-item-id="${item.id}">
              +
            </button>
          </div>
          
          <!-- Remove Button -->
          <button class="remove-btn" data-item-id="${item.id}">
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
