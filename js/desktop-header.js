// ========================================
// DESKTOP HEADER COMPONENT
// Electric Ink IE
// ========================================

import { onAuthChange, openAuthModal, logout } from './auth.js';
import { isAdmin } from './admin-check.js';

'use strict';

  // ────────── Header HTML Template ──────────
  const headerHTML = `
    <header class="desktop-header" role="banner">
      <div class="desktop-header-container">
        
        <!-- Logo (Left) -->
        <a href="/" class="desktop-logo" aria-label="Electric Ink IE Home">
          <img src="/images/logos/logo+typo-white.png" alt="Electric Ink Ireland">
        </a>
        
        <!-- Navigation Menu (Center) -->
        <nav class="desktop-nav" role="navigation" aria-label="Main navigation">
          <ul class="desktop-menu">
            <li><a href="/" class="desktop-menu-link">Home</a></li>
            
            <li class="desktop-menu-item-dropdown">
              <button class="desktop-menu-link desktop-dropdown-trigger" aria-expanded="false" aria-haspopup="true">
                Shop
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              <ul class="desktop-dropdown-menu" role="menu">
                <li role="none"><a href="/category.html?cat=cartridges" role="menuitem">Cartridges</a></li>
                <li role="none"><a href="/category.html?cat=needles" role="menuitem">Needles</a></li>
                <li role="none"><a href="/category.html?cat=inks" role="menuitem">Inks</a></li>
                <li role="none"><a href="/category.html?cat=cosmetics" role="menuitem">Cosmetics</a></li>
                <li role="none"><a href="/category.html?cat=machines" role="menuitem">Machines</a></li>
                <li role="none"><a href="/category.html?cat=accessories" role="menuitem">Accessories</a></li>
              </ul>
            </li>
            
            <li><a href="/howtousecosmetics.html" class="desktop-menu-link">How to Use</a></li>
            <li><a href="/about-us.html" class="desktop-menu-link">About</a></li>
            <li><a href="/contact-us.html" class="desktop-menu-link">Contact</a></li>
          </ul>
        </nav>
        
        <!-- Auth / Cart (Right) -->
        <div class="desktop-right-actions">
          <!-- Signed out -->
          <div class="header-auth" data-auth-signed-out style="display:flex;align-items:center;gap:8px;">
            <button class="sign-in-btn" data-open-auth>Sign in</button>
            <a href="/cart.html" class="desktop-cart" aria-label="Shopping cart">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="9" cy="21" r="1"/>
                <circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
              <span class="desktop-cart-count" data-cart-count>0</span>
            </a>
          </div>

          <!-- Signed in -->
          <div class="header-auth" data-auth-signed-in style="display:none;align-items:center;gap:8px;">
            <div class="user-menu">
              <button class="user-menu-trigger">
                <span class="user-name">User</span>
                <svg width="12" height="12" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" stroke-width="2"/></svg>
              </button>
              <div class="user-dropdown" style="display:none;">
                <a href="/profile.html">My Profile</a>
                <a href="/admin/dashboard.html" data-admin-only style="display:none; margin-left:12px;">Dashboard</a>
                <button class="logout-btn">Logout</button>
              </div>
            </div>
            <a href="/cart.html" class="desktop-cart" aria-label="Shopping cart">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="9" cy="21" r="1"></circle>
                <circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
              </svg>
              <span class="desktop-cart-count" data-cart-count>0</span>
            </a>
          </div>
        </div>

      </div>
    </header>
  `;

  // ────────── Setup Dropdown Toggle ──────────
  function setupDropdown() {
    const dropdownTrigger = document.querySelector('.desktop-dropdown-trigger');
    const dropdownMenu = document.querySelector('.desktop-dropdown-menu');
    const dropdownItem = document.querySelector('.desktop-menu-item-dropdown');
    
    if (!dropdownTrigger || !dropdownMenu) return;
    
    // Toggle on click
    dropdownTrigger.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpen = dropdownItem.classList.contains('open');
      
      if (isOpen) {
        dropdownItem.classList.remove('open');
        dropdownTrigger.setAttribute('aria-expanded', 'false');
      } else {
        dropdownItem.classList.add('open');
        dropdownTrigger.setAttribute('aria-expanded', 'true');
      }
    });
    
    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!dropdownItem.contains(e.target)) {
        dropdownItem.classList.remove('open');
        dropdownTrigger.setAttribute('aria-expanded', 'false');
      }
    });
    
    // Close on ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dropdownItem.classList.contains('open')) {
        dropdownItem.classList.remove('open');
        dropdownTrigger.setAttribute('aria-expanded', 'false');
        dropdownTrigger.focus();
      }
    });
  }

  // ────────── Update Cart Count ──────────
  function updateCartCount() {
    // Prefer global cart API when available, otherwise fallback to localStorage
    let totalItems = 0;
    if (window.cart && typeof window.cart.getCartCount === 'function') {
      try {
        totalItems = window.cart.getCartCount();
      } catch (e) {
        totalItems = 0;
      }
    } else {
      const cart = JSON.parse(localStorage.getItem('electricink_cart') || '[]');
      totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    }

    const countElements = document.querySelectorAll('.desktop-cart-count');
    countElements.forEach(el => {
      el.textContent = totalItems;
      el.style.display = totalItems > 0 ? 'flex' : 'none';
    });
  }

  // ────────── Set Active Menu Item ──────────
  function setActiveMenuItem() {
    const currentPath = window.location.pathname;
    const menuLinks = document.querySelectorAll('.desktop-menu-link');
    
    menuLinks.forEach(link => {
      const href = link.getAttribute('href');
      
      // Remove active class from all
      link.classList.remove('active');
      
      // Check if current page matches link
      if (href === currentPath || 
          (href === '/' && (currentPath === '/' || currentPath === '/index.html')) ||
          (href === '/howtousecosmetics.html' && currentPath.includes('howtouse')) ||
          (href === '/about-us.html' && currentPath.includes('about')) ||
          (href === '/contact-us.html' && currentPath.includes('contact'))) {
        link.classList.add('active');
      }
      
      // Shop dropdown active state
      if (currentPath.includes('category.html') || currentPath.includes('products.html')) {
        const shopTrigger = document.querySelector('.desktop-dropdown-trigger');
        if (shopTrigger) {
          shopTrigger.classList.add('active');
        }
      }
    });
  }

  // ────────── Initialize ──────────
  function initDesktopHeader() {
    // Check if already exists
    const existingHeader = document.querySelector('.desktop-header');
    if (existingHeader) {
      existingHeader.remove();
    }

    // Inject header at start of body
    document.body.insertAdjacentHTML('afterbegin', headerHTML);

    // Initialize functionality
    setupDropdown();
    updateCartCount();
    setActiveMenuItem();

    // Wire auth UI actions
    const signInBtn = document.querySelector('[data-open-auth]');
    signInBtn?.addEventListener('click', (e) => { e.preventDefault(); try { openAuthModal('login'); } catch (err) { console.warn(err); } });

    const userTrigger = document.querySelector('.user-menu-trigger');
    userTrigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = document.querySelector('.user-dropdown');
      if (!dropdown) return;
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.user-menu')) {
        const dd = document.querySelector('.user-dropdown');
        if (dd) dd.style.display = 'none';
      }
    });

    document.querySelector('.logout-btn')?.addEventListener('click', async () => {
      try { await logout(); window.location.reload(); } catch (err) { console.warn(err); }
    });

    // Observe auth state
    try {
      // Singleton flag: evita múltiplos observers quando ambos headers carregam
      if (window.__AUTH_OBSERVER_ATTACHED) {
        console.log('[DesktopHeader] Auth observer already attached; skipping.');
      } else {
        onAuthChange((user) => {
          console.log('[DesktopHeader] onAuthChange callback fired. user=', user && user.email);
          if (user) showSignedInState(user); else showSignedOutState();
        });
        window.__AUTH_OBSERVER_ATTACHED = true;
      }
    } catch (e) { console.warn('Auth observer not available', e); showSignedOutState(); }
  }

  // Quick immediate check: poll for restored auth if observer hasn't fired yet
  (async () => {
    try {
      console.log('[DesktopHeader] immediate auth check start');
      // Singleton flag: evita múltiplos observers quando ambos headers carregam
      // Se outro header já fez o polling inicial, apenas obter o user uma vez.
      if (window.__AUTH_POLL_DONE) {
        try {
          const m = await import('./auth.js');
          const { getCurrentUser } = m;
          const userOnce = await getCurrentUser();
          if (userOnce) {
            showSignedInState(userOnce);
          } else {
            showSignedOutState();
          }
        } catch (e) { /* ignore */ }
        return;
      }

      const m = await import('./auth.js');
      const { getCurrentUser } = m;
      let user = null;
      for (let i = 0; i < 6; i++) {
        try { user = await getCurrentUser(); } catch (e) {}
        if (user) break;
        await new Promise(r => setTimeout(r, 100));
      }
      if (user) {
        console.log('[DesktopHeader] immediate user found:', user.email);
        showSignedInState(user);
      } else {
        console.log('[DesktopHeader] no immediate user; waiting for observer');
      }
      // Marcar que o polling inicial já foi executado (singleton)
      window.__AUTH_POLL_DONE = true;
    } catch (e) {
      console.warn('[DesktopHeader] immediate auth check failed:', e && e.message);
    }
  })();

  // ────────── Auto Initialize ──────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDesktopHeader);
  } else {
    initDesktopHeader();
  }

  // ────────── Listen for cart updates ──────────
  window.addEventListener('cart-updated', updateCartCount);

  // Auth helpers
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
        const adminLink = document.querySelector('[data-admin-only]');
        if (adminLink) adminLink.style.display = isAdminUser ? 'inline-block' : 'none';
      } catch (e) { /* ignore */ }
    })();
  }
