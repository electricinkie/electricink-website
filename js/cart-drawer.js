// ========================================
// CART DRAWER & BOTTOM SHEET - ELECTRIC INK IE
// ========================================

(function () {
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
        <img class="cart-drawer-item-img" src="${escHtml(item.image || '/images/placeholder.jpg')}" alt="${escHtml(item.name)}">
        <div class="cart-drawer-item-info">
          <p class="cart-drawer-item-name">${escHtml(item.name)}</p>
          ${item.available_on_request ? `<p class="cart-drawer-item-variant" style="color:#43BDAB;font-size:10px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Order on Request</p>` : ''}
          ${item.variant ? `<p class="cart-drawer-item-variant">${escHtml(item.variant)}</p>` : ''}
          <div class="cart-drawer-item-row">
            <span class="cart-drawer-item-price">€${(item.price * item.quantity).toFixed(2)}</span>
            <div class="cart-drawer-item-qty">
              <button class="cart-drawer-qty-btn" onclick="cartDrawer.updateQty(${idx}, -1)">−</button>
              <span class="cart-drawer-qty-num">${escHtml(String(item.quantity))}</span>
              <button class="cart-drawer-qty-btn" onclick="cartDrawer.updateQty(${idx}, 1)">+</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    const total = getTotal(cart);
    const sub = parseFloat(total);
    let isReferred = false;
    try {
      const _t = localStorage.getItem('ei_loyalty_token');
      if (_t) {
        const _p = JSON.parse(atob(_t.split('.')[1]));
        isReferred = !!_p.referred;
      }
    } catch (_) {}
    // Free-shipping progress: the copy changes with how much is left, and the
    // bar stays visible once the threshold is reached. Compared before any
    // discount, like the checkout and the server.
    const shipThreshold = 150;
    const shipBands = [
      { above: 100, text: `Free shipping on orders over €${shipThreshold} (incl. VAT). €{gap} to go.` },
      { above: 50, text: 'You’re on your way: add €{gap} more for free shipping.' },
      { above: 20, text: 'Getting close: just €{gap} more for free shipping.', close: true },
      { above: 0, text: 'Almost there: only €{gap} more for free shipping.', close: true },
    ];
    const truckIcon = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11v14"/><path d="M15 3h4l3 3v9h-7z"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>';
    const checkIcon = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
    const shipGap = shipThreshold - sub;
    const shipBand = shipBands.find(b => shipGap > b.above);
    const progressHtml = shipBand ? `
      <div class="ship-progress${shipBand.close ? ' is-close' : ''}">
        <p class="ship-progress-text">${truckIcon}<span>${shipBand.text.replace('{gap}', shipGap.toFixed(2))}</span></p>
        <div class="ship-progress-track">
          <div class="ship-progress-fill" style="width:${Math.min(100, Math.floor((sub / shipThreshold) * 100))}%;"></div>
        </div>
      </div>` : `
      <div class="ship-progress is-unlocked">
        <p class="ship-progress-text">${checkIcon}<span>Free shipping unlocked.</span></p>
        <div class="ship-progress-track">
          <div class="ship-progress-fill" style="width:100%;"></div>
        </div>
        <p class="ship-progress-note">Your order ships free, same-day in Dublin D01–D08 included.</p>
      </div>`;

    footerEl.innerHTML = `
      <div class="cart-drawer-subtotal">
        <span class="cart-drawer-subtotal-label">Subtotal</span>
        <span class="cart-drawer-subtotal-value">€${total}</span>
      </div>
      ${progressHtml}
      <button class="cart-drawer-btn-checkout" onclick="window.location.href='/checkout.html'">Checkout →</button>
      <button class="cart-drawer-btn-continue" onclick="cartDrawer.close()">Continue shopping</button>
    `;
    renderCampaignLine(cart, footerEl);
  }

  // Black Cat Friday status line. Display only: the server decides the price.
  // Any failure leaves the drawer exactly as it was.
  const CAMPAIGN_CACHE_KEY = 'ei_catalog_rows';
  const CAMPAIGN_CACHE_MS = 5 * 60 * 1000;
  let campaignRenderId = 0;
  let campaignDataPromise = null;
  let campaignDataAt = 0;
  function loadCampaignLib() {
    if (window.EI_CAMPAIGN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/lib/campaign.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  async function loadCatalogRows() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CAMPAIGN_CACHE_KEY));
      const age = cached ? Date.now() - cached.t : -1;
      if (cached && Array.isArray(cached.rows) && age >= 0 && age < CAMPAIGN_CACHE_MS) return cached.rows;
    } catch (_) {}
    const res = await fetch('/api/catalog?type=products');
    if (!res.ok) throw new Error('catalog');
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('catalog');
    const slim = rows.map(r => ({ id: r.id, variant_id: r.variant_id, price_ex: r.price_ex, effective_price_ex: r.effective_price_ex, promo_active: r.promo_active, stock: r.stock }));
    try { sessionStorage.setItem(CAMPAIGN_CACHE_KEY, JSON.stringify({ t: Date.now(), rows: slim })); } catch (_) {}
    return slim;
  }
  function loadCampaignData() {
    if (!campaignDataPromise || Date.now() - campaignDataAt >= CAMPAIGN_CACHE_MS) {
      campaignDataAt = Date.now();
      campaignDataPromise = Promise.all([
        loadCampaignLib(),
        fetch('/campaign.config.json').then(r => { if (!r.ok) throw new Error('config'); return r.json(); }),
        loadCatalogRows()
      ]);
    }
    return campaignDataPromise;
  }
  function grossCents(ex) { return Math.round(parseFloat((parseFloat(ex) * 1.23).toFixed(2)) * 100); }
  function euros(cents) { return (cents / 100).toFixed(2).replace(/\.00$/, ''); }
  async function renderCampaignLine(cart, footerEl) {
    const myId = ++campaignRenderId;
    try {
      const [, config, rows] = await loadCampaignData();
      const lib = window.EI_CAMPAIGN;
      if (!lib || !lib.validateConfig(config).ok || !lib.isActive(config, Date.now())) return;
      const lines = cart.map(item => {
        const row = rows.find(r => (r.variant_id ? r.id + '-' + r.variant_id : r.id) === item.id);
        if (!row) throw new Error('unmapped');
        const stockNum = (row.stock === null || row.stock === undefined || row.stock === '') ? NaN : Number(row.stock);
        return {
          productId: row.id,
          variantId: row.variant_id || row.id,
          qty: item.quantity,
          listCents: grossCents(row.price_ex),
          paidCents: grossCents(row.effective_price_ex),
          promoActive: row.promo_active === true,
          stock: Number.isInteger(stockNum) ? Math.max(0, stockNum) : null
        };
      });
      const r = lib.compute({ config, nowMs: Date.now(), lines });
      if (!r.ok || !r.active) return;
      const vaultKeys = config.vault.items.map(i => i.productId + '|' + i.variantId);
      const hasVault = lines.some(l => l.promoActive && vaultKeys.indexOf(l.productId + '|' + l.variantId) !== -1);
      const kitSets = r.perBundle.find(b => b.sets > 0);
      const kit = kitSets ? config.bundles.find(b => b.id === kitSets.id) : null;
      let text;
      if (r.violations.length) text = 'Max reached on this one. Others are still open.';
      else if (kit) text = `Sumi Set ✓. ${kit.variantIds.length} for €${euros(kit.priceCents)}.`;
      else if (r.boostUnlocked && r.boostedUnits > 0) text = `60% unlocked ✓ You're saving an extra €${((r.extraCents - r.bundleExtraCents) / 100).toFixed(2)}.`;
      else if (r.boostUnlocked && hasVault) return;
      else if (hasVault) text = 'Vault 50% ✓. Add any €10+ item outside the Vault to unlock 60%.';
      else text = 'Black Cat Vault: 50% off. Add any Vault item.';
      if (myId !== campaignRenderId || !footerEl.isConnected) return;
      const p = document.createElement('p');
      p.className = 'cart-drawer-campaign';
      p.style.cssText = 'font-size:12px;margin:0 0 10px;';
      p.textContent = text;
      footerEl.insertBefore(p, footerEl.firstChild);
    } catch (_) {}
  }

  function renderBottomSheet(item) {
    const cart = getCart();
    const total = getTotal(cart);
    const el = document.getElementById('bs-content');
    if (!el) return;
    el.innerHTML = `
      <div class="bs-added-row">
        <img class="bs-added-img" src="${escHtml(item.image || '/images/placeholder.jpg')}" alt="${escHtml(item.name)}">
        <div class="bs-added-info">
          <p class="bs-added-name">${escHtml(item.name)}</p>
          ${item.available_on_request ? `<p style="color:#43BDAB;font-size:10px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;margin:2px 0 0;">Order on Request</p>` : ''}
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
      if (typeof fbq === 'function') {
        fbq('track', 'AddToCart', {
          content_name: item.name,
          currency: 'EUR',
          value: parseFloat(getTotal(getCart()))
        });
      }
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