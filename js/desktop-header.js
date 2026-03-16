// ========================================
// DESKTOP HEADER COMPONENT
// Electric Ink IE
// ========================================

// Auth removed - guest checkout only
// import { onAuthChange, openAuthModal, logout } from './auth.js';

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
                <li role="none"><a href="/category.html?cat=cosmetics" role="menuitem">Cosmetics</a></li>
                <li role="none"><a href="/category.html?cat=cartridges" role="menuitem">Cartridges</a></li>
                <li role="none"><a href="/category.html?cat=inks" role="menuitem">Inks</a></li>
                <li role="none"><a href="/category.html?cat=accessories" role="menuitem">Accessories</a></li>
                <li role="none"><a href="/category.html?cat=machines" role="menuitem">Machines</a></li>
              </ul>
            </li>
            
            <li><a href="/howtousecosmetics.html" class="desktop-menu-link">How to Use</a></li>
            <li><a href="/about-us.html" class="desktop-menu-link">About</a></li>
            <li><a href="/contact-us.html" class="desktop-menu-link">Contact</a></li>
          </ul>
        </nav>
        
        <!-- Cart (Right) - Auth removed -->
        <div class="desktop-right-actions">
          <!-- Notification Center -->
          <div class="ei-notif-wrap" style="position:relative;">
            <button class="ei-notif-btn hidden" id="desktopNotifBtn"
                    aria-label="Notifications">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <span class="ei-notif-badge hidden" id="desktopNotifBadge"></span>
            </button>
            <div class="ei-notif-dropdown" id="desktopNotifDropdown">
              <div class="ei-notif-header">
                <span class="ei-notif-header-title">Black Cat Rewards</span>
                <button class="ei-notif-mark-read" id="desktopMarkRead">
                  Mark all read
                </button>
              </div>
              <div class="ei-notif-list" id="desktopNotifList">
                <div class="ei-notif-empty">Loading...</div>
              </div>
              <div class="ei-notif-footer">
                <a href="/account.html">View all rewards →</a>
              </div>
            </div>
          </div>
          <a href="/cart.html" class="desktop-cart" aria-label="Shopping cart">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="9" cy="21" r="1"/>
              <circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
            <span class="desktop-cart-count" data-cart-count>0</span>
          </a>
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

  // Auth removed - guest checkout only
  // Removed forceUpdateDesktopAuthUI function

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

  // ────────── Notification Center ──────────
  var NOTIF_API = (typeof INTERNAL_API_URL !== 'undefined')
    ? INTERNAL_API_URL
    : 'https://ei-internal-production.up.railway.app';
  var NOTIF_TOKEN_KEY = 'ei_loyalty_token';

  const ACTION_CONFIG = {
    purchase:      { label: 'Catokens earned',  color: '#43BDAB', svg: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 16V4M4 10l6-6 6 6" stroke="#43BDAB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    welcome_bonus: { label: 'Welcome bonus',    color: '#FFA300', svg: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.3L10 14.3l-4.8 2.5.9-5.3L2.2 7.7l5.4-.8L10 2z" stroke="#FFA300" stroke-width="1.8" stroke-linejoin="round"/></svg>' },
    mission:       { label: 'Mission complete', color: '#0033C4', svg: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="#0033C4" stroke-width="2"/><path d="M6 10l3 3 5-6" stroke="#0033C4" stroke-width="2" stroke-linecap="round"/></svg>' },
    badge:         { label: 'Badge unlocked',   color: '#FFA300', svg: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.3L10 14.3l-4.8 2.5.9-5.3L2.2 7.7l5.4-.8L10 2z" stroke="#FFA300" stroke-width="1.8" stroke-linejoin="round"/></svg>' },
    redemption:    { label: 'Coupon generated', color: '#ff4444', svg: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="2" y="6" width="16" height="8" rx="1" stroke="#ff4444" stroke-width="1.8"/><path d="M7 10h6M10 7v6" stroke="#ff4444" stroke-width="1.8" stroke-linecap="round"/></svg>' },
    manual:        { label: 'Catokens added',   color: '#43BDAB', svg: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 16V4M4 10l6-6 6 6" stroke="#43BDAB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
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

  function renderNotifList(notifications, listEl, badgeEl) {
    if (!notifications.length) {
      listEl.innerHTML = '<div class="ei-notif-empty">No activity yet.</div>';
      return;
    }
    listEl.innerHTML = notifications.map(n => {
      const cfg = ACTION_CONFIG[n.action] || ACTION_CONFIG.manual;
      const isUnread = !n.read_at;
      const pts = n.points > 0 ? `+${n.points.toLocaleString()} pts` : `${n.points.toLocaleString()} pts`;
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
    const token = localStorage.getItem(NOTIF_TOKEN_KEY);
    const btn   = document.getElementById(`${prefix}NotifBtn`);
    const badge = document.getElementById(`${prefix}NotifBadge`);
    const list  = document.getElementById(`${prefix}NotifList`);
    if (!btn || !badge || !list) return;

    if (!token) { btn.classList.add('hidden'); return; }

    btn.classList.remove('hidden');
    try {
      const res = await fetch(`${NOTIF_API}/api/loyalty/notifications`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) { btn.classList.add('hidden'); return; }
      const data = await res.json();
      renderNotifList(data.notifications || [], list, badge);
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
        list.querySelectorAll('.ei-notif-item.unread').forEach(el => {
          el.classList.remove('unread');
        });
        list.querySelectorAll('.ei-notif-unread-dot').forEach(el => {
          el.classList.add('hidden');
        });
      }
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

  // ────────── Initialize ──────────
  function initDesktopHeader() {
    // Check if already exists
    const existingHeader = document.querySelector('.desktop-header');
    if (existingHeader) {
      existingHeader.remove();
    }

    // Inject notifications CSS if not already loaded
    if (!document.querySelector('link[href="/css/notifications.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/css/notifications.css';
      document.head.appendChild(link);
    }

    // Inject header at start of body
    document.body.insertAdjacentHTML('afterbegin', headerHTML);

    // Initialize functionality
    setupDropdown();
    updateCartCount();
    setActiveMenuItem();
    initNotifications('desktop');

    // Auth removed - all auth UI interactions removed
  }

  // Auth removed - quick immediate check removed
  // Auth removed - showSignedOutState and showSignedInState removed

  // ────────── Auto Initialize ──────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDesktopHeader);
  } else {
    initDesktopHeader();
  }

  // ────────── Listen for cart updates ──────────
  window.addEventListener('cart-updated', updateCartCount);

  // Auth removed - showSignedOutState and showSignedInState functions removed
