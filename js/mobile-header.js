// ========================================
// MOBILE HEADER COMPONENT - FIXED
// Electric Ink IE
// ========================================

import { onAuthChange, openAuthModal, logout } from './auth.js';
import { isAdmin } from './admin-check.js';

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
          <img src="/images/logos/logo+typo-white.png" alt="Electric Ink Ireland" style="height: 40px; width: auto;">
        </a>
        
        <!-- Cart and Auth (Right) -->
        <div class="mobile-right-actions">
          <!-- ✅ FIX 1: Signed out state COM botão Sign in -->
          <div class="header-auth" data-auth-signed-out style="display:flex;align-items:center;gap:8px;">
            <button class="sign-in-btn" data-open-auth>Sign in</button>
            <a href="/cart.html" class="header-cart" aria-label="Shopping cart">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="9" cy="21" r="1"/>
                <circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
              <span class="cart-count" data-cart-count>0</span>
            </a>
          </div>

          <!-- ✅ FIX 2: Signed in state COM cart icon -->
          <div class="header-auth" data-auth-signed-in style="display:none;align-items:center;gap:8px;">
            <div class="user-menu">
              <button class="user-menu-trigger">
                <span class="user-name">User</span>
                <svg width="12" height="12" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" stroke-width="2"/></svg>
              </button>
              <div class="user-dropdown" style="display:none;">
                <a href="/profile.html">My Profile</a>
                <a href="/admin/dashboard.html" data-admin-only style="display:none;">Dashboard</a>
                <button class="logout-btn">Logout</button>
              </div>
            </div>
            <!-- ✅ Agora TEM o cart quando logado -->
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
            <li><a href="/category.html?cat=cartridges">Cartridges</a></li>
            <li><a href="/category.html?cat=needles">Needles</a></li>
            <li><a href="/category.html?cat=inks">Inks</a></li>
            <li><a href="/category.html?cat=cosmetics">Cosmetics</a></li>
            <li><a href="/category.html?cat=machines">Machines</a></li>
            <li><a href="/category.html?cat=accessories">Accessories</a></li>
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
        
        <!-- Admin (hidden by default, shown for admins) -->
        <li id="mobile-admin-link" style="display:none;">
          <a href="/admin/dashboard.html" class="mobile-menu-link">Admin Dashboard</a>
        </li>
        
      </ul>

    </nav>
  `;

  // ────────── Initialize Header ──────────
  function initMobileHeader() {
    // REMOVE any existing headers (prevents duplication)
    const existingHeader = document.querySelector('.site-header');
    if (existingHeader) existingHeader.remove();
    
    const existingMenu = document.querySelector('.mobile-menu');
    if (existingMenu) existingMenu.remove();
    
    const existingBackdrop = document.querySelector('.mobile-menu-backdrop');
    if (existingBackdrop) existingBackdrop.remove();

    // Inject header at start of body
    document.body.insertAdjacentHTML('afterbegin', headerHTML);

    // Initialize functionality
    setupMenuToggle();
    setupSubmenu();
    updateCartCount();
    setActiveMenuItem();
    setupUserMenu();

    // ✅ FIX 3: Wire auth button igual desktop (busca [data-open-auth])
    const signInBtn = document.querySelector('[data-open-auth]');
    signInBtn?.addEventListener('click', (e) => { 
      e.preventDefault(); 
      try { openAuthModal('login'); } catch (err) { console.warn(err); } 
    });

    // ✅ Immediate auth check (igual desktop)
    (async () => {
      try {
        console.log('[MobileHeader] immediate auth check start');
        const m = await import('./auth.js');
        const { getCurrentUser } = m;
        let user = null;
        for (let i = 0; i < 6; i++) {
          try { user = await getCurrentUser(); } catch (e) {}
          if (user) break;
          await new Promise(r => setTimeout(r, 100));
        }
        if (user) {
          console.log('[MobileHeader] immediate user found:', user.email);
          showSignedInState(user);
        } else {
          console.log('[MobileHeader] no immediate user; waiting for observer');
        }
      } catch (e) {
        console.warn('[MobileHeader] immediate auth check failed:', e && e.message);
      }
    })();
  }

  // ────────── User Menu & Auth Helpers ──────────
  function setupUserMenu() {
    // Toggle user dropdown when trigger clicked
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('.user-menu-trigger');
      if (trigger) {
        e.stopPropagation();
        const dropdown = trigger.parentElement.querySelector('.user-dropdown');
        if (dropdown) dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        return;
      }
      // Close open dropdowns when clicking outside
      if (!e.target.closest('.user-menu')) {
        document.querySelectorAll('.user-dropdown').forEach(dd => dd.style.display = 'none');
      }
    });

    // Logout handler
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.logout-btn');
      if (btn) {
        try { logout().then(() => window.location.reload()).catch(() => {}); } catch (err) {}
        const dd = btn.closest('.user-dropdown');
        if (dd) dd.style.display = 'none';
      }
    });
  }

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

    // Close on ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileMenu.classList.contains('open')) {
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

    const cartBadges = document.querySelectorAll('[data-cart-count]');
    cartBadges.forEach(badge => {
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
      const shopTrigger = document.querySelector('.submenu-trigger');
      if (shopTrigger) shopTrigger.classList.add('active');
    }
  }

  // ────────── Auth helpers (igual desktop) ──────────
  function showSignedOutState() {
    const out = document.querySelector('[data-auth-signed-out]');
    const inEl = document.querySelector('[data-auth-signed-in]');
    if (out) out.style.display = 'flex';
    if (inEl) inEl.style.display = 'none';
  }

  function showSignedInState(user) {
    const out = document.querySelector('[data-auth-signed-out]');
    const inEl = document.querySelector('[data-auth-signed-in]');
    if (out) out.style.display = 'none';
    if (inEl) inEl.style.display = 'flex';
    const nameEl = document.querySelector('.user-name');
    if (nameEl) nameEl.textContent = user.displayName || (user.email ? user.email.split('@')[0] : 'User');

    // reveal admin based on Firestore-driven admin list
    (async () => {
      try {
        const isAdminUser = await isAdmin({ user });
        const adminEls = document.querySelectorAll('[data-admin-only]');
        adminEls.forEach(el => el.style.display = isAdminUser ? '' : 'none');
        const mobileAdminLink = document.getElementById('mobile-admin-link');
        if (mobileAdminLink) mobileAdminLink.style.display = isAdminUser ? 'block' : 'none';
      } catch (e) { /* ignore */ }
    })();
  }

  // ────────── Listen for Cart Updates ──────────
  window.addEventListener('cart-updated', updateCartCount);

  // ────────── Auto-Initialize ──────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileHeader);
  } else {
    initMobileHeader();
  }

  // ✅ Wire global auth observer (igual desktop)
  try {
    onAuthChange((user) => {
      console.log('[MobileHeader] onAuthChange callback fired. user=', user && user.email);
      if (user) showSignedInState(user); else showSignedOutState();
    });
  } catch (e) {
    console.warn('Auth observer not available', e);
    showSignedOutState();
  }

  // ────────── Export for manual init ──────────
  window.MobileHeader = {
    init: initMobileHeader,
    updateCartCount: updateCartCount
  };