// ========================================
// DESKTOP HEADER COMPONENT
// Electric Ink IE
// ========================================

(function() {
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
        
        <!-- Cart Icon (Right) -->
        <a href="/cart.html" class="desktop-cart" aria-label="Shopping cart">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="9" cy="21" r="1"/>
            <circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          <span class="desktop-cart-count" data-cart-count>0</span>
        </a>
        
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
    // Prefer using window.cart API when available, but fall back to localStorage
    let count = 0;

    if (window.cart && typeof window.cart.getCartCount === 'function') {
      try {
        count = Number(window.cart.getCartCount()) || 0;
      } catch (e) {
        count = 0;
      }
    } else {
      // Fallback: read from localStorage so badge updates even if header initializes early
      try {
        const stored = localStorage.getItem('electricink_cart');
        const parsed = stored ? JSON.parse(stored) : [];
        count = parsed.reduce((sum, item) => sum + (item.quantity || 0), 0);
      } catch (e) {
        count = 0;
      }
    }

    // Update any elements that declare the cart count
    const countElements = document.querySelectorAll('[data-cart-count], .desktop-cart-count, .cart-count');
    countElements.forEach(el => {
      el.textContent = count;
      el.style.display = count > 0 ? 'flex' : 'none';
    });

    // Update header cart icon (if present)
    const cartIcon = document.querySelector('.desktop-cart') || document.querySelector('.header-cart');
    if (cartIcon) {
      cartIcon.classList.toggle('has-items', count > 0);
    }
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
  }

  // ────────── Auto Initialize ──────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDesktopHeader);
  } else {
    initDesktopHeader();
  }

  // ────────── Listen for cart updates ──────────
  window.addEventListener('cart-updated', updateCartCount);

  // Also listen to storage events for cross-tab updates
  window.addEventListener('storage', (e) => {
    if (e.key === 'electricink_cart') {
      updateCartCount();
    }
  });

})();

// ========================================
// DESKTOP HEADER COMPONENT
// Electric Ink IE
// ========================================

(function() {
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
        
        <!-- Cart Icon (Right) -->
        <a href="/cart.html" class="desktop-cart" aria-label="Shopping cart">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="9" cy="21" r="1"/>
            <circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          <span class="desktop-cart-count" data-cart-count>0</span>
        </a>
        
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
    if (!window.cart) return;
    
    const count = window.cart.getCartCount();
    const countElements = document.querySelectorAll('.desktop-cart-count');
    
    countElements.forEach(el => {
      el.textContent = count;
      if (count > 0) {
        el.style.display = 'flex';
      } else {
        el.style.display = 'none';
      }
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
  }

  // ────────── Auto Initialize ──────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDesktopHeader);
  } else {
    initDesktopHeader();
  }

  // ────────── Listen for cart updates ──────────
  window.addEventListener('cart-updated', updateCartCount);

})();
