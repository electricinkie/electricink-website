// ========================================
// MOBILE HEADER COMPONENT - FIXED AUTH STATE
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
        
        <!-- Cart (Right) - sempre visível -->
        <div class="mobile-right-actions">
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

      <!-- ✅ AUTH SECTION NO TOPO DO MENU -->
      <div class="mobile-auth-section" style="padding: 20px; border-bottom: 1px solid #e5e7eb;">
        <!-- Signed OUT state -->
        <div id="mobile-auth-signed-out" style="display:flex; justify-content:center;">
          <button id="mobile-auth-button" class="mobile-auth-button">Sign in</button>
        </div>
        
        <!-- Signed IN state -->
        <div id="mobile-auth-signed-in" style="display:none;">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
            <div style="width:40px; height:40px; min-width:40px; min-height:40px; border-radius:50%; background:#43BDAB; color:white; display:flex; align-items:center; justify-content:center; font-weight:600; font-size:16px; flex-shrink:0;">
              <span id="mobile-user-initials">U</span>
            </div>
            <div style="flex:1;">
              <div id="mobile-user-name" style="font-weight:600; color:#ffa300; font-size:15px;">User</div>
              <div id="mobile-user-email" style="font-size:11px; color:#6b7280; max-width:110px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block; line-height:1;">email@example.com</div>
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <a href="/profile.html" style="flex:1; padding:10px; text-align:center; background:#f3f4f6; border-radius:8px; font-size:14px; font-weight:500; color:#374151; text-decoration:none;">Profile</a>
            <button id="mobile-logout-btn" style="flex:1; padding:10px; background:#fee2e2; border:none; border-radius:8px; font-size:14px; font-weight:500; color:#dc2626; cursor:pointer;">Logout</button>
          </div>
        </div>
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
        
        <!-- Admin (hidden by default) -->
        <li id="mobile-admin-link" style="display:none;">
          <a href="/admin/dashboard.html" class="mobile-menu-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            Admin Dashboard
          </a>
        </li>
        
      </ul>

    </nav>
  `;

  // ────────── Helper: Generate initials ──────────
  function getInitials(name) {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0] || '').slice(0, 2).join('').toUpperCase();
  }

  // ────────── Initialize Header ──────────
  function initMobileHeader() {
    // REMOVE any existing headers (prevents duplication)
    document.querySelector('.site-header')?.remove();
    document.querySelector('.mobile-menu')?.remove();
    document.querySelector('.mobile-menu-backdrop')?.remove();

    // Inject header at start of body
    document.body.insertAdjacentHTML('afterbegin', headerHTML);

    // Initialize functionality
    setupMenuToggle();
    setupSubmenu();
    updateCartCount();
    setActiveMenuItem();
    setupAuthHandlers();

    // ✅ CRITICAL: Immediate auth state check AFTER DOM injection
    applyAuthStateImmediately();
  }

  // ────────── Setup Auth Handlers ──────────
  function setupAuthHandlers() {
    // Sign in button
    document.getElementById('mobile-auth-button')?.addEventListener('click', () => {
      try { openAuthModal('login'); } catch (err) { console.warn(err); }
    });

    // Logout button
    document.getElementById('mobile-logout-btn')?.addEventListener('click', async () => {
      try {
        await logout();
        window.location.reload();
      } catch (err) {
        console.warn('Logout failed:', err);
        window.location.reload(); // Force reload anyway
      }
    });
  }

  // ────────── Apply Auth State Immediately ──────────
  async function applyAuthStateImmediately() {
    try {
      console.log('[MobileHeader] 🔍 Checking immediate auth state...');
      const m = await import('./auth.js');
      const { getCurrentUser } = m;

      // Singleton flag: evita múltiplos observers quando ambos headers carregam
      // Se o polling já foi feito por outro header, apenas obtém o user uma vez.
      if (window.__AUTH_POLL_DONE) {
        try {
          const userOnce = await getCurrentUser();
          updateMobileAuthUI(userOnce || null);
        } catch (e) {
          updateMobileAuthUI(null);
        }
        return;
      }

      // Poll for restored auth (Firebase can take a moment to restore from persistence)
      let user = null;
      for (let i = 0; i < 8; i++) {
        try {
          user = await getCurrentUser();
          if (user) break;
        } catch (e) {
          // Ignore transient errors
        }
        await new Promise(r => setTimeout(r, 150)); // 150ms intervals
      }

      if (user) {
        console.log('[MobileHeader] ✅ User found immediately:', user.email);
        updateMobileAuthUI(user);
      } else {
        console.log('[MobileHeader] ℹ️ No user found; showing signed-out state');
        updateMobileAuthUI(null);
      }
      // Marcar que o polling inicial já foi executado (singleton)
      window.__AUTH_POLL_DONE = true;
    } catch (e) {
      console.warn('[MobileHeader] ⚠️ Immediate auth check failed:', e.message);
      updateMobileAuthUI(null);
    }
  }

  // ────────── Update Mobile Auth UI ──────────
  function updateMobileAuthUI(user) {
    const signedOut = document.getElementById('mobile-auth-signed-out');
    const signedIn = document.getElementById('mobile-auth-signed-in');
    const userName = document.getElementById('mobile-user-name');
    const userEmail = document.getElementById('mobile-user-email');
    const userInitials = document.getElementById('mobile-user-initials');
    const adminLink = document.getElementById('mobile-admin-link');

    if (!signedOut || !signedIn) {
      console.warn('[MobileHeader] ⚠️ Auth UI elements not found in DOM');
      return;
    }

    if (user) {
      // SIGNED IN
      signedOut.style.display = 'none';
      signedIn.style.display = 'block';
      
      if (userName) userName.textContent = user.displayName || 'User';
      if (userEmail) userEmail.textContent = user.email || '';
      if (userInitials) userInitials.textContent = getInitials(user.displayName || user.email);

      // Check admin status
      (async () => {
        try {
          const isAdminUser = await isAdmin({ user });
          if (adminLink) adminLink.style.display = isAdminUser ? 'block' : 'none';
        } catch (e) {
          if (adminLink) adminLink.style.display = 'none';
        }
      })();

      console.log('[MobileHeader] ✅ UI updated: SIGNED IN as', user.email);
    } else {
      // SIGNED OUT
      signedOut.style.display = 'flex';
      signedIn.style.display = 'none';
      if (adminLink) adminLink.style.display = 'none';

      console.log('[MobileHeader] ✅ UI updated: SIGNED OUT');
    }
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

  // ────────── Wire Global Auth Observer ──────────
  try {
    // Singleton flag: evita múltiplos observers quando ambos headers carregam
    if (window.__AUTH_OBSERVER_ATTACHED) {
      console.log('[MobileHeader] Auth observer already attached; skipping.');
    } else {
      onAuthChange((user) => {
        console.log('[MobileHeader] 📡 onAuthChange fired. User:', user?.email || 'none');
        updateMobileAuthUI(user);
      });
      window.__AUTH_OBSERVER_ATTACHED = true;
    }
  } catch (e) {
    console.warn('[MobileHeader] ⚠️ Auth observer setup failed:', e.message);
  }

  // ────────── Export ──────────
  window.MobileHeader = {
    init: initMobileHeader,
    updateCartCount: updateCartCount
  };