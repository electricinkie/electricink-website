/* ========================================
   COOKIE CONSENT (shared by every page that used GA4)
   - Nothing from Google or Meta is requested until the visitor clicks "Accept all".
   - The choice lives in localStorage under its own key as { choice, timestamp }.
     The old `cookieConsent` key (previous toast) is ignored on purpose.
   - After about 6 months the banner asks again.
   - A link with [data-cookie-preferences] (page footers) reopens the banner.
   - The Meta Pixel is loaded through window.eiLoadMetaPixel, defined in js/pixel.js.
   ======================================== */
(function () {
  'use strict';

  var KEY = 'ei_cookie_consent';
  var MAX_AGE_MS = 183 * 24 * 60 * 60 * 1000; // about 6 months
  var GA_ID = 'G-F7K2B1EJYH';
  var POLICY_URL = '/cookie-policy.html';

  // ────────── Stored choice ──────────
  function readChoice() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || (data.choice !== 'accept' && data.choice !== 'reject')) return null;
      var ts = data.timestamp;
      if (typeof ts !== 'number' || !isFinite(ts)) return null;
      var age = Date.now() - ts;
      // Expired, or a timestamp more than a day in the future (clock tampering): ask again
      if (age > MAX_AGE_MS || age < -86400000) return null;
      return data.choice;
    } catch (e) {
      return null;
    }
  }

  function saveChoice(choice) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ choice: choice, timestamp: Date.now() }));
    } catch (e) { /* storage blocked: the choice only lasts for this page view */ }
  }

  var current = readChoice();

  // ────────── Trackers ──────────
  var googleLoaded = false;

  function loadGoogle() {
    if (googleLoaded) return;
    googleLoaded = true;
    window.dataLayer = window.dataLayer || [];
    // gtag.js needs the Arguments object, not an array
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
  }

  function loadPixel() {
    // Defined by js/pixel.js (absent when the exclude_pixel cookie is set).
    // pixel.js also checks window.eiConsent when it runs, so the order of the two scripts does not matter.
    if (typeof window.eiLoadMetaPixel === 'function') window.eiLoadMetaPixel();
  }

  function enableTrackers() {
    window['ga-disable-' + GA_ID] = false;
    if (typeof window.fbq === 'function') {
      try { window.fbq('consent', 'grant'); } catch (e) { /* ignore */ }
    }
    loadGoogle();
    loadPixel();
  }

  function clearTrackingCookies() {
    var names = document.cookie.split(';').map(function (c) { return c.split('=')[0].trim(); });
    var host = window.location.hostname;
    var parts = host.split('.');
    var domains = [null, host, '.' + host];
    if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));
    names.forEach(function (name) {
      if (!/^(_ga(_.*)?|_gid|_gat(_.*)?|_fbp|_fbc)$/.test(name)) return;
      domains.forEach(function (domain) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' +
          (domain ? '; domain=' + domain : '');
      });
    });
  }

  function disableTrackers() {
    // Scripts already loaded in this page view cannot be unloaded: stop them from sending,
    // and the next page will not load them at all.
    window['ga-disable-' + GA_ID] = true;
    if (typeof window.fbq === 'function') {
      try { window.fbq('consent', 'revoke'); } catch (e) { /* ignore */ }
    }
    clearTrackingCookies();
  }

  // ────────── Banner ──────────
  var banner = null;
  var lastFocus = null;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function injectStyles() {
    if (document.getElementById('ei-consent-styles')) return;
    var style = document.createElement('style');
    style.id = 'ei-consent-styles';
    style.textContent =
      ".ei-consent{position:fixed;left:16px;bottom:16px;z-index:10001;width:calc(100% - 32px);max-width:440px;box-sizing:border-box;padding:20px;background:#fff;color:#111;border:1px solid #e8e8e8;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.16);font-family:'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}" +
      ".ei-consent:focus{outline:none}" +
      ".ei-consent__title{margin:0 0 8px;font-family:'Outfit','Montserrat',sans-serif;font-size:18px;font-weight:800;line-height:1.2;color:#000}" +
      ".ei-consent__text{margin:0 0 12px;font-size:14px;line-height:1.5;color:#444}" +
      ".ei-consent__link{display:inline-block;margin:0 0 16px;font-size:14px;font-weight:600;color:#000;text-decoration:underline}" +
      ".ei-consent__link:hover{color:#43BDAB}" +
      ".ei-consent__actions{display:flex;gap:12px}" +
      ".ei-consent__btn{flex:1 1 0;min-height:44px;padding:12px 16px;border:2px solid #000;border-radius:8px;background:#000;color:#fff;font-family:'Outfit','Montserrat',sans-serif;font-size:15px;font-weight:700;line-height:1.2;cursor:pointer}" +
      ".ei-consent__btn:hover{background:#43BDAB;border-color:#43BDAB;color:#fff}" +
      ".ei-consent__btn:focus-visible,.ei-consent__link:focus-visible{outline:3px solid #43BDAB;outline-offset:2px}" +
      "@media (max-width:480px){.ei-consent{left:12px;right:12px;bottom:12px;width:auto;max-width:none;padding:16px}}";
    document.head.appendChild(style);
  }

  function buildBanner() {
    injectStyles();

    var root = el('div', 'ei-consent');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-labelledby', 'ei-consent-title');
    root.setAttribute('aria-describedby', 'ei-consent-text');
    root.tabIndex = -1;

    var title = el('p', 'ei-consent__title', 'Cookies');
    title.id = 'ei-consent-title';

    var text = el('p', 'ei-consent__text',
      'We use cookies to understand how the site is used and to measure advertising. ' +
      'Essential cookies are always on. Analytics and marketing cookies are only used if you accept.');
    text.id = 'ei-consent-text';

    var link = el('a', 'ei-consent__link', 'Cookie policy');
    link.href = POLICY_URL;

    // Same class, size and colour on both buttons: neither choice is favoured
    var actions = el('div', 'ei-consent__actions');
    var accept = el('button', 'ei-consent__btn', 'Accept all');
    accept.type = 'button';
    accept.setAttribute('data-choice', 'accept');
    var reject = el('button', 'ei-consent__btn', 'Reject all');
    reject.type = 'button';
    reject.setAttribute('data-choice', 'reject');
    actions.appendChild(accept);
    actions.appendChild(reject);

    root.appendChild(title);
    root.appendChild(text);
    root.appendChild(link);
    root.appendChild(actions);

    root.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-choice]') : null;
      if (btn) choose(btn.getAttribute('data-choice'));
    });

    // A banner reopened from the footer can be closed with Escape (the choice stays as it was)
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && current) hideBanner();
    });

    return root;
  }

  function showBanner(takeFocus) {
    if (!document.body) return;
    if (!banner) banner = buildBanner();
    if (!banner.parentNode) document.body.appendChild(banner);
    if (takeFocus) {
      lastFocus = document.activeElement;
      banner.focus();
    }
  }

  function hideBanner() {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus(); } catch (e) { /* ignore */ }
    }
    lastFocus = null;
  }

  function choose(choice) {
    if (choice !== 'accept' && choice !== 'reject') return;
    current = choice;
    saveChoice(choice);
    if (choice === 'accept') enableTrackers();
    else disableTrackers();
    hideBanner();
  }

  // ────────── Public API (used by pixel.js and the footer links) ──────────
  window.eiConsent = {
    granted: function () { return current === 'accept'; },
    choice: function () { return current; },
    reopen: function () { showBanner(true); }
  };

  // Footer links: <a href="#" data-cookie-preferences>
  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('[data-cookie-preferences]') : null;
    if (!link) return;
    e.preventDefault();
    showBanner(true);
  });

  // ────────── Start ──────────
  if (current === 'accept') enableTrackers();

  function init() {
    if (!current) showBanner(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
