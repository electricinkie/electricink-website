// ========================================
// MOBILE HEADER COMPONENT - FIXED AUTH STATE
// Electric Ink IE
// ========================================

// Auth removed - guest checkout only
// import { onAuthChange, openAuthModal, logout } from './auth.js';

'use strict';

  // ────────── Header HTML Template ──────────
  const headerHTML = `
    <header class="site-header" role="banner">
      <div class="header-container">
        
        <!-- Hamburger Menu Button -->
        <button class="hamburger-btn" 
                aria-label="Open navigation menu"
                aria-expanded="false"
                aria-controls="mobile-menu">
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
        </button>
        
        <!-- Logo (Centered) -->
        <a href="/" class="header-logo" aria-label="Electric Ink IE Home">
          <img src="/images/logos/logo+typo-white.png" alt="Electric Ink Ireland">
        </a>
        
        <!-- Cart (Right) - sempre visível -->
        <div class="mobile-right-actions">
          <!-- Notification Center -->
          <div class="ei-notif-wrap" style="position:relative;">
            <button class="ei-notif-btn hidden" id="mobileNotifBtn"
                    aria-label="Notifications">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <span class="ei-notif-badge hidden" id="mobileNotifBadge"></span>
            </button>
            <div class="ei-notif-dropdown" id="mobileNotifDropdown">
              <div class="ei-notif-header">
                <span class="ei-notif-header-title">Black Cat Rewards</span>
                <button class="ei-notif-mark-read" id="mobileMarkRead">
                  Mark all read
                </button>
              </div>
              <div class="ei-notif-list" id="mobileNotifList">
                <div class="ei-notif-empty">Loading...</div>
              </div>
              <div class="ei-notif-footer">
                <a href="/account.html">View all rewards →</a>
              </div>
            </div>
          </div>
          <a href="/cart.html" class="header-cart" aria-label="Shopping cart">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="9" cy="21" r="1"/>
              <circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
            <span class="cart-count" data-cart-count>0</span>
          </a>
        </div>

      </div>
    </header>
    
    <!-- Mobile Menu Overlay -->
    <div class="mobile-menu-backdrop"></div>
    <nav class="mobile-menu" id="mobile-menu" role="navigation" aria-label="Mobile navigation">
      
      <div class="mobile-menu-header">
        <span class="mobile-menu-title">MENU</span>
        <button class="mobile-menu-close" aria-label="Close menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Auth removed - guest checkout only -->

      <ul class="mobile-menu-list">
        
        <!-- Home -->
        <li>
          <a href="/" class="mobile-menu-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            Home
          </a>
        </li>
        
        <!-- Shop by Category -->
        <li class="has-submenu">
          <button class="mobile-menu-link submenu-trigger">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            Shop by Category
            <svg class="submenu-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <ul class="mobile-submenu">
            <li><a href="/category.html?cat=cosmetics">Cosmetics</a></li>          
            <li><a href="/category.html?cat=cartridges">Cartridges</a></li>
            <li><a href="/category.html?cat=inks">Inks</a></li>
            <li><a href="/category.html?cat=accessories">Accessories</a></li>
            <li><a href="/category.html?cat=machines">Machines</a></li>
          </ul>
        </li>
        
        <!-- How to Use -->
        <li>
          <a href="/howtousecosmetics.html" class="mobile-menu-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            How to Use
          </a>
        </li>
        
        <!-- About Us -->
        <li>
          <a href="/about-us.html" class="mobile-menu-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            About Us
          </a>
        </li>
        
        <!-- Contact -->
        <li>
          <a href="/contact-us.html" class="mobile-menu-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Contact
          </a>
        </li>
        
        <!-- Divider -->
        <li class="menu-divider"></li>

        <!-- Black Cat Rewards -->
        <li id="mobileLoyaltyItem">
          <a href="/loyalty.html" id="mobileLoyaltyGuest" class="mobile-menu-link" style="color:#FFA300;display:flex;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#FFA300" stroke="none"><circle cx="12" cy="12" r="10"/><text x="12" y="16" text-anchor="middle" font-size="11" fill="#000" font-family="serif">✦</text></svg>
            Black Cat Rewards
          </a>
          <a href="/account.html" id="mobileLoyaltyLoggedIn" class="mobile-menu-link" style="color:#FFA300;display:none;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#FFA300" stroke="none"><circle cx="12" cy="12" r="10"/><text x="12" y="16" text-anchor="middle" font-size="11" fill="#000" font-family="serif">✦</text></svg>
            <span id="mobileLoyaltyLabel">My Rewards</span>
          </a>
        </li>

        <!-- Divider -->
        <li class="menu-divider"></li>

        <!-- Shopping Cart -->
        <li>
          <a href="/cart.html" class="mobile-menu-link mobile-menu-link-highlight">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="9" cy="21" r="1"/>
              <circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
            Shopping Cart
            <span class="menu-cart-count" data-cart-count>0</span>
          </a>
        </li>
        
      </ul>

    </nav>
  `;

  // Auth removed - getInitials helper removed

  // ────────── Notification Center ──────────
  var NOTIF_API = (typeof INTERNAL_API_URL !== 'undefined')
    ? INTERNAL_API_URL
    : 'https://ei-internal-production.up.railway.app';
  var NOTIF_TOKEN_KEY = 'ei_loyalty_token';

  const ACTION_CONFIG = {
    purchase:      { label: 'Catokens earned',  svg: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 16V4M4 10l6-6 6 6" stroke="#43BDAB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    welcome_bonus: { label: 'Welcome bonus',    svg: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.3L10 14.3l-4.8 2.5.9-5.3L2.2 7.7l5.4-.8L10 2z" stroke="#FFA300" stroke-width="1.8" stroke-linejoin="round"/></svg>' },
    mission:       { label: 'Mission complete', svg: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="#0033C4" stroke-width="2"/><path d="M6 10l3 3 5-6" stroke="#0033C4" stroke-width="2" stroke-linecap="round"/></svg>' },
    badge:         { label: 'Badge unlocked',   svg: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.3L10 14.3l-4.8 2.5.9-5.3L2.2 7.7l5.4-.8L10 2z" stroke="#FFA300" stroke-width="1.8" stroke-linejoin="round"/></svg>' },
    redemption:    { label: 'Coupon generated', svg: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="2" y="6" width="16" height="8" rx="1" stroke="#ff4444" stroke-width="1.8"/><path d="M7 10h6M10 7v6" stroke="#ff4444" stroke-width="1.8" stroke-linecap="round"/></svg>' },
    manual:        { label: 'Catokens added',   svg: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 16V4M4 10l6-6 6 6" stroke="#43BDAB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    referral:      { label: 'Referral bonus',   color: '#43BDAB', svg: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M13 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM4 16a6 6 0 0 1 12 0" stroke="#43BDAB" stroke-width="2" stroke-linecap="round"/></svg>' },
    anniversary:   { label: 'Anniversary bonus',color: '#FFA300', svg: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.3L10 14.3l-4.8 2.5.9-5.3L2.2 7.7l5.4-.8L10 2z" stroke="#FFA300" stroke-width="1.8" stroke-linejoin="round"/></svg>' },
    refund:        { label: 'Catokens refunded',color: '#43BDAB', svg: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10l6 6 6-6M10 4v12" stroke="#43BDAB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  };

  function formatTimeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  }

  function renderNotifList(notifications, listEl) {
    if (!notifications.length) {
      listEl.innerHTML = '<div class="ei-notif-empty">No activity yet.</div>';
      return;
    }
    listEl.innerHTML = notifications.map(n => {
      const cfg = ACTION_CONFIG[n.action] || ACTION_CONFIG.manual;
      const isUnread = !n.read_at;
        const pts = n.points > 0
          ? `+${n.points.toLocaleString()} Catokens`
          : `${n.points.toLocaleString()} Catokens`;
      const text = n.points < 0
        ? `${cfg.label}: ${n.description || ''}`
        : `${pts} — ${n.description || cfg.label}`;
      return `
        <div class="ei-notif-item ${isUnread ? 'unread' : ''}">
          <div class="ei-notif-icon ${n.action}">${cfg.svg}</div>
          <div class="ei-notif-body">
            <p class="ei-notif-text">${text}</p>
            <p class="ei-notif-time">${formatTimeAgo(n.created_at)}</p>
          </div>
          <span class="ei-notif-unread-dot ${isUnread ? '' : 'hidden'}"></span>
        </div>`;
    }).join('');
  }

  async function loadNotifications(prefix) {
    const token    = localStorage.getItem(NOTIF_TOKEN_KEY);
    const btn      = document.getElementById(`${prefix}NotifBtn`);
    const badge    = document.getElementById(`${prefix}NotifBadge`);
    const list     = document.getElementById(`${prefix}NotifList`);
    if (!btn || !badge || !list) return;
    if (!token) { btn.classList.add('hidden'); return; }
    btn.classList.remove('hidden');
    try {
      const res = await fetch(`${NOTIF_API}/api/loyalty/notifications`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) { btn.classList.add('hidden'); return; }
      const data = await res.json();
      renderNotifList(data.notifications || [], list);
      if (data.unread_count > 0) {
        badge.textContent = data.unread_count > 9 ? '9+' : data.unread_count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    } catch {
      btn.classList.add('hidden');
    }
  }

  async function markAllRead(prefix) {
    const token = localStorage.getItem(NOTIF_TOKEN_KEY);
    if (!token) return;
    try {
      await fetch(`${NOTIF_API}/api/loyalty/notifications/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const badge = document.getElementById(`${prefix}NotifBadge`);
      const list  = document.getElementById(`${prefix}NotifList`);
      if (badge) badge.classList.add('hidden');
      if (list) {
        list.querySelectorAll('.ei-notif-item.unread')
          .forEach(el => el.classList.remove('unread'));
        list.querySelectorAll('.ei-notif-unread-dot')
          .forEach(el => el.classList.add('hidden'));
      }
    } catch {}
  }

  async function initLoyaltyBtn() {
    const guest    = document.getElementById('mobileLoyaltyGuest');
    const loggedIn = document.getElementById('mobileLoyaltyLoggedIn');
    const label    = document.getElementById('mobileLoyaltyLabel');
    if (!guest || !loggedIn) return;
    const token = localStorage.getItem(NOTIF_TOKEN_KEY);
    if (!token) return;
    try {
      const res = await fetch(`${NOTIF_API}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const name = (data.name || '').split(' ')[0];
      const pts  = (data.loyalty_points_total || 0).toLocaleString();
      if (label) label.textContent = `${name} · ${pts} ✦`;
      guest.style.display = 'none';
      loggedIn.style.display = 'flex';
    } catch {}
  }

  function initNotifications(prefix) {
    const btn      = document.getElementById(`${prefix}NotifBtn`);
    const dropdown = document.getElementById(`${prefix}NotifDropdown`);
    const markRead = document.getElementById(`${prefix}MarkRead`);
    if (!btn || !dropdown) return;

    loadNotifications(prefix);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('open');
      dropdown.classList.toggle('open');
      if (!isOpen) markAllRead(prefix);
    });

    document.addEventListener('click', (e) => {
      if (!btn.closest('.ei-notif-wrap').contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });

    if (markRead) {
      markRead.addEventListener('click', () => markAllRead(prefix));
    }
  }

  // ────────── Initialize Header ──────────
  function initMobileHeader() {
    // REMOVE any existing headers (prevents duplication)
    document.querySelector('.site-header')?.remove();
    document.querySelector('.mobile-menu')?.remove();
    document.querySelector('.mobile-menu-backdrop')?.remove();

    // Inject header at start of body
    document.body.insertAdjacentHTML('afterbegin', headerHTML);

    // Inject notifications CSS if not already loaded
    if (!document.querySelector('link[href="/css/notifications.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/css/notifications.css';
      document.head.appendChild(link);
    }
      initLoyaltyBtn();
    initNotifications('mobile');

    // Initialize functionality
    setupMenuToggle();
    setupSubmenu();
    updateCartCount();
    setActiveMenuItem();

    // Auth removed - setupAuthHandlers and applyAuthStateImmediately removed
  }

  // Auth removed - applyAuthStateImmediately and updateMobileAuthUI functions removed

  // ────────── Menu Toggle ──────────
  function setupMenuToggle() {
    const hamburger = document.querySelector('.hamburger-btn');
    const mobileMenu = document.querySelector('.mobile-menu');
    const backdrop = document.querySelector('.mobile-menu-backdrop');
    const closeBtn = document.querySelector('.mobile-menu-close');

    function openMenu() {
      mobileMenu.classList.add('open');
      backdrop.classList.add('show');
      hamburger.classList.add('active');
      hamburger.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
      mobileMenu.classList.remove('open');
      backdrop.classList.remove('show');
      hamburger.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    hamburger?.addEventListener('click', openMenu);
    closeBtn?.addEventListener('click', closeMenu);
    backdrop?.addEventListener('click', closeMenu);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileMenu?.classList.contains('open')) {
        closeMenu();
      }
    });
  }

  // ────────── Submenu Toggle ──────────
  function setupSubmenu() {
    const submenuTrigger = document.querySelector('.submenu-trigger');
    submenuTrigger?.addEventListener('click', function() {
      this.parentElement.classList.toggle('open');
    });
  }

  // ────────── Update Cart Count ──────────
  function updateCartCount() {
    let totalItems = 0;
    if (window.cart && typeof window.cart.getCartCount === 'function') {
      try { totalItems = window.cart.getCartCount(); } catch (e) { totalItems = 0; }
    } else {
      const cart = JSON.parse(localStorage.getItem('electricink_cart') || '[]');
      totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    }

    document.querySelectorAll('[data-cart-count]').forEach(badge => {
      badge.textContent = totalItems;
      badge.style.display = totalItems > 0 ? 'flex' : 'none';
    });
  }

  // ────────── Set Active Menu Item ──────────
  function setActiveMenuItem() {
    const currentPath = window.location.pathname;
    const menuLinks = document.querySelectorAll('.mobile-menu-link');

    menuLinks.forEach(link => {
      const href = link.getAttribute('href');
      link.classList.remove('active');

      if (href === currentPath ||
          (href === '/' && (currentPath === '/' || currentPath === '/index.html')) ||
          (href === '/howtousecosmetics.html' && currentPath.includes('howtouse')) ||
          (href === '/about-us.html' && currentPath.includes('about')) ||
          (href === '/contact-us.html' && currentPath.includes('contact'))) {
        link.classList.add('active');
      }
    });

    if (currentPath.includes('category.html') || currentPath.includes('products.html')) {
      document.querySelector('.submenu-trigger')?.classList.add('active');
    }
  }

  // ────────── Listen for Cart Updates ──────────
  window.addEventListener('cart-updated', updateCartCount);

  // ────────── Auto-Initialize ──────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileHeader);
  } else {
    initMobileHeader();
  }

  // Auth removed - auth observer and forceUpdateMobileAuthUI removed

  // ────────── Export ──────────
  window.MobileHeader = {
    init: initMobileHeader,
    updateCartCount: updateCartCount
  };