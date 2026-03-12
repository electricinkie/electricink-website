// ========================================
// CART DRAWER & BOTTOM SHEET - ELECTRIC INK IE
// ========================================

(function () {
  'use strict';

  function getCart() {
    try { return JSON.parse(localStorage.getItem('electricink_cart') || '[]'); } catch { return []; }
  }

  function getTotal(cart) {
    return cart.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2);
  }

  function saveCart(cart) {
    localStorage.setItem('electricink_cart', JSON.stringify(cart));
    window.dispatchEvent(new Event('cart-updated'));
  }

  // ── Build DOM ──
  function buildDOM() {
    if (document.getElementById('cart-drawer')) return;

    document.body.insertAdjacentHTML('beforeend', `
      <div id="cart-drawer-overlay"></div>

      <div id="cart-drawer" role="dialog" aria-modal="true" aria-label="Cart">
        <div class="cart-drawer-header">
          <span class="cart-drawer-title">Your cart</span>
          <button class="cart-drawer-close" onclick="cartDrawer.close()" aria-label="Close cart">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="cart-drawer-items" id="cart-drawer-items"></div>
        <div class="cart-drawer-footer" id="cart-drawer-footer"></div>
      </div>

      <div id="cart-bottom-sheet">
        <div class="bs-handle"></div>
        <div id="bs-content"></div>
      </div>
    `);

    document.getElementById('cart-drawer-overlay').addEventListener('click', () => cartDrawer.close());
  }

  function renderDrawerItems() {
    const cart = getCart();
    const itemsEl = document.getElementById('cart-drawer-items');
    const footerEl = document.getElementById('cart-drawer-footer');
    if (!itemsEl || !footerEl) return;

    if (cart.length === 0) {
      itemsEl.innerHTML = `<div class="cart-drawer-empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg><span>Your cart is empty</span></div>`;
      footerEl.innerHTML = '';
      return;
    }

    itemsEl.innerHTML = cart.map((item, idx) => `
      <div class="cart-drawer-item">
        <img class="cart-drawer-item-img" src="${item.image || '/images/placeholder.jpg'}" alt="${item.name}">
        <div class="cart-drawer-item-info">
          <p class="cart-drawer-item-name">${item.name}</p>
          ${item.variant ? `<p class="cart-drawer-item-variant">${item.variant}</p>` : ''}
          <div class="cart-drawer-item-row">
            <span class="cart-drawer-item-price">€${(item.price * item.quantity).toFixed(2)}</span>
            <div class="cart-drawer-item-qty">
              <button class="cart-drawer-qty-btn" onclick="cartDrawer.updateQty(${idx}, -1)">−</button>
              <span class="cart-drawer-qty-num">${item.quantity}</span>
              <button class="cart-drawer-qty-btn" onclick="cartDrawer.updateQty(${idx}, 1)">+</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    const total = getTotal(cart);
    footerEl.innerHTML = `
      <div class="cart-drawer-subtotal">
        <span class="cart-drawer-subtotal-label">Subtotal</span>
        <span class="cart-drawer-subtotal-value">€${total}</span>
      </div>
      <p class="cart-drawer-shipping-note">Shipping calculated at checkout</p>
      <button class="cart-drawer-btn-checkout" onclick="window.location.href='/checkout.html'">Checkout →</button>
      <button class="cart-drawer-btn-continue" onclick="cartDrawer.close()">Continue shopping</button>
    `;
  }

  function renderBottomSheet(item) {
    const cart = getCart();
    const total = getTotal(cart);
    const el = document.getElementById('bs-content');
    if (!el) return;
    el.innerHTML = `
      <div class="bs-added-row">
        <img class="bs-added-img" src="${item.image || '/images/placeholder.jpg'}" alt="${item.name}">
        <div class="bs-added-info">
          <p class="bs-added-name">${item.name}</p>
          <p class="bs-added-check">✓ Added to cart</p>
        </div>
        <span class="bs-added-price">€${item.price.toFixed(2)}</span>
      </div>
      <div class="bs-total-row">
        <span class="bs-total-label">Cart total</span>
        <span class="bs-total-value">€${total}</span>
      </div>
      <div class="bs-actions">
        <button class="bs-btn-checkout" onclick="window.location.href='/checkout.html'">Checkout</button>
        <button class="bs-btn-continue" onclick="cartDrawer.closeSheet()">Keep shopping</button>
      </div>
    `;
  }

  // ── Public API ──
  window.cartDrawer = {
    open() {
      buildDOM();
      renderDrawerItems();
      document.getElementById('cart-drawer').classList.add('open');
      document.getElementById('cart-drawer-overlay').classList.add('open');
      document.body.style.overflow = 'hidden';
    },
    close() {
      const d = document.getElementById('cart-drawer');
      const o = document.getElementById('cart-drawer-overlay');
      const s = document.getElementById('cart-bottom-sheet');
      if (d) d.classList.remove('open');
      if (o) o.classList.remove('open');
      if (s) s.classList.remove('open');
      document.body.style.overflow = '';
    },
    closeSheet() {
      const s = document.getElementById('cart-bottom-sheet');
      const o = document.getElementById('cart-drawer-overlay');
      if (s) s.classList.remove('open');
      if (o) o.classList.remove('open');
    },
    openOnAdd(item) {
      buildDOM();
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        renderBottomSheet(item);
        document.getElementById('cart-bottom-sheet').classList.add('open');
        document.getElementById('cart-drawer-overlay').classList.add('open');
        setTimeout(() => this.closeSheet(), 6000);
      } else {
        renderDrawerItems();
        document.getElementById('cart-drawer').classList.add('open');
        document.getElementById('cart-drawer-overlay').classList.add('open');
      }
      document.body.style.overflow = 'hidden';
    },
    updateQty(idx, delta) {
      const cart = getCart();
      if (!cart[idx]) return;
      cart[idx].quantity += delta;
      if (cart[idx].quantity <= 0) cart.splice(idx, 1);
      saveCart(cart);
      renderDrawerItems();
      if (window.cart && window.cart.updateCartCount) window.cart.updateCartCount();
    },
    refresh() {
      renderDrawerItems();
    }
  };

  // ── Listen for cart-updated ──
  window.addEventListener('cart-updated', () => {
    if (document.getElementById('cart-drawer')?.classList.contains('open')) {
      renderDrawerItems();
    }
  });

})();
