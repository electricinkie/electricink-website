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
          <li><a href="/loyalty.html" class="desktop-menu-link">Rewards</a></li>
          </ul>
        </nav>
        
        <!-- Cart (Right) - Auth removed -->
        <div class="desktop-right-actions">
          <!-- Loyalty Button -->
          <div id="desktopLoyaltyBtn" style="display:none;align-items:center;position:relative;">
            <!-- Logged in — dropdown trigger -->
            <button id="desktopLoyaltyLoggedIn"
               style="display:none;align-items:center;gap:6px;color:#fff;background:none;border:1px solid rgba(255,255,255,0.15);cursor:pointer;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:600;padding:6px 10px;border-radius:8px;transition:all 0.2s;white-space:nowrap;">
              <img src="/images/account/ink-points-coin.webp" width="18" height="18" alt="" style="border-radius:50%;">
              <span id="desktopLoyaltyLabel"></span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity:0.6;"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <!-- Dropdown menu -->
            <div id="desktopAccountDropdown"
               style="display:none;position:absolute;top:calc(100% + 10px);right:0;background:#fff;border:1px solid #eee;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.12);min-width:180px;overflow:hidden;z-index:9999;">
              <a href="/account.html"
                 style="display:flex;align-items:center;gap:8px;padding:12px 16px;color:#111;text-decoration:none;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:600;border-bottom:1px solid #f0f0f0;transition:background 0.15s;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                My Account
              </a>
              <button id="desktopSignOutBtn"
                 style="display:flex;align-items:center;gap:8px;width:100%;padding:12px 16px;color:#c0392b;background:none;border:none;cursor:pointer;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:600;text-align:left;transition:background 0.15s;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Sign out
              </button>
            </div>
            <!-- Guest — sign in link -->
            <a href="/account.html" id="desktopLoyaltyGuest"
               style="display:none;align-items:center;gap:6px;color:#fff;text-decoration:none;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:600;padding:6px 10px;border:1px solid rgba(255,255,255,0.15);border-radius:8px;transition:all 0.2s;white-space:nowrap;">
              Sign in
            </a>
          </div>

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
      const pts = n.points > 0 ? `+${n.points.toLocaleString()} Catokens` : `${n.points.toLocaleString()} Catokens`;
      const _escN = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      const text = n.points < 0
        ? `${cfg.label}: ${_escN(n.description)}`
        : `${pts} — ${_escN(n.description) || cfg.label}`;
      const safeAction = _escN(n.action);
      return `
        <div class="ei-notif-item ${isUnread ? 'unread' : ''}">
          <div class="ei-notif-icon ${safeAction}">${cfg.svg}</div>
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
      btn.classList.remove('hidden');
    } catch (err) { console.warn('[desktop] loadNotifications error:', err); }
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
    } catch (err) { console.warn('[desktop] markAllRead error:', err); }
  }

  function initAccountDropdown() {
    const trigger  = document.getElementById('desktopLoyaltyLoggedIn');
    const dropdown = document.getElementById('desktopAccountDropdown');
    if (!trigger || !dropdown) return;
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.style.display === 'block';
      dropdown.style.display = isOpen ? 'none' : 'block';
    });
    document.addEventListener('click', (e) => {
      if (!trigger.closest('#desktopLoyaltyBtn').contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  }

  function updateDesktopSignOut() {
    const btn = document.getElementById('desktopSignOutBtn');
    if (!btn) return;
    btn.onclick = async () => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(4px);';
      overlay.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:28px 32px;max-width:340px;width:90vw;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
          <div style="font-family:'Montserrat',sans-serif;text-align:center;">
            <div style="font-size:16px;font-weight:700;color:#000;margin-bottom:8px;">Sign out?</div>
            <div style="font-size:13px;color:#555;margin-bottom:24px;">You'll need to sign in again to access your Catokens and rewards.</div>
            <div style="display:flex;gap:10px;">
              <button id="so-cancel" style="flex:1;padding:12px;border-radius:9px;border:1px solid #e0e0e0;background:#fff;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:600;color:#555;cursor:pointer;">Cancel</button>
              <button id="so-confirm" style="flex:1;padding:12px;border-radius:9px;border:none;background:#c0392b;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:700;color:#fff;cursor:pointer;">Sign Out</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const confirmed = await new Promise(resolve => {
        overlay.querySelector('#so-confirm').onclick = () => { overlay.remove(); resolve(true); };
        overlay.querySelector('#so-cancel').onclick  = () => { overlay.remove(); resolve(false); };
        overlay.onclick = e => { if (e.target === overlay) { overlay.remove(); resolve(false); } };
      });
      if (!confirmed) return;
      localStorage.removeItem(NOTIF_TOKEN_KEY);
      localStorage.removeItem('ei_last_level');
      localStorage.removeItem('ei_last_pts');
      window.dispatchEvent(new CustomEvent('ei:auth-change', { detail: { loggedIn: false } }));
      if (window.toast) window.toast.info('Signed out successfully', 3000);
      if (window.location.pathname.startsWith('/account')) {
        setTimeout(() => { window.location.href = '/'; }, 1200);
      }
    };
  }

  async function initLoyaltyBtn() {
    const wrap     = document.getElementById('desktopLoyaltyBtn');
    const loggedIn = document.getElementById('desktopLoyaltyLoggedIn');
    const guest    = document.getElementById('desktopLoyaltyGuest');
    const label    = document.getElementById('desktopLoyaltyLabel');
    if (!wrap) return;
    const token = localStorage.getItem(NOTIF_TOKEN_KEY);
    if (!token) {
      wrap.style.display = 'flex';
      guest.style.display = 'flex';
      return;
    }
    // Show immediately from JWT payload — no network wait
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const quickName = (payload.name || '').split(' ')[0];
      if (quickName) {
        label.textContent = `${quickName} · ...`;
        wrap.style.display = 'flex';
        loggedIn.style.display = 'inline-flex';
      }
    } catch (err) { console.warn('[desktop] initLoyaltyBtn JWT parse error:', err); }
    // Update with fresh points from API in background
    try {
      const res = await fetch(`${NOTIF_API}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        wrap.style.display = 'flex';
        guest.style.display = 'flex';
        loggedIn.style.display = 'none';
        return;
      }
      const data = await res.json();
      const customer = data.customer || data;
      const name = (customer.name || '').split(' ')[0];
      const pts  = (customer.loyalty_points_total || 0).toLocaleString();
      label.textContent = `${name} · ${pts}`;
      wrap.style.display = 'flex';
      loggedIn.style.display = 'inline-flex';
      guest.style.display = 'none';
    } catch (err) { console.warn('[desktop] initLoyaltyBtn fetch error:', err);
      wrap.style.display = 'flex';
      guest.style.display = 'flex';
      loggedIn.style.display = 'none';
    }
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
  async function initDesktopHeader() {
    // Check if already exists
    // Inject notifications CSS and wait for it to load before rendering header
    await new Promise((resolve) => {
      if (document.querySelector('link[href="/css/notifications.css"]')) {
        resolve();
        return;
      }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/css/notifications.css';
      link.onload = resolve;
      link.onerror = resolve;
      document.head.appendChild(link);
    });

    // Remove existing header only after CSS is ready, then inject new one
    const existingHeader = document.querySelector('.desktop-header');
    if (existingHeader) existingHeader.remove();
    document.body.insertAdjacentHTML('afterbegin', headerHTML);

    // Initialize functionality
    setupDropdown();
    updateCartCount();
    setActiveMenuItem();
    initLoyaltyBtn();
    updateDesktopSignOut();
    initAccountDropdown();
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

  // Re-render loyalty button and notifications when login/logout happens
  window.addEventListener('storage', (e) => {
    if (e.key === NOTIF_TOKEN_KEY) {
      const wrap     = document.getElementById('desktopLoyaltyBtn');
      const loggedIn = document.getElementById('desktopLoyaltyLoggedIn');
      const guest    = document.getElementById('desktopLoyaltyGuest');
      const label    = document.getElementById('desktopLoyaltyLabel');
      if (wrap) wrap.style.display = 'none';
      if (loggedIn) loggedIn.style.display = 'none';
      if (guest) guest.style.display = 'none';
      if (label) label.textContent = '';
      initLoyaltyBtn();
      loadNotifications('desktop');
    }
  });

  window.addEventListener('ei:auth-change', (e) => {
    const wrap     = document.getElementById('desktopLoyaltyBtn');
    const loggedIn = document.getElementById('desktopLoyaltyLoggedIn');
    const guest    = document.getElementById('desktopLoyaltyGuest');
    const label    = document.getElementById('desktopLoyaltyLabel');
    const signOut  = document.getElementById('desktopSignOutBtn');
    if (wrap) wrap.style.display = 'none';
    if (loggedIn) loggedIn.style.display = 'none';
    if (guest) guest.style.display = 'none';
    if (label) label.textContent = '';
    if (signOut) signOut.style.display = 'none';
    const notifBtn = document.getElementById('desktopNotifBtn');
    if (notifBtn) notifBtn.classList.add('hidden');
    initLoyaltyBtn();
    updateDesktopSignOut();
    loadNotifications('desktop');
  });

  // Auth removed - showSignedOutState and showSignedInState functions removed
