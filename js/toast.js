// ========================================
// GLOBAL TOAST NOTIFICATION SYSTEM
// Electric Ink IE
// ========================================

(function() {
  'use strict';

  // ────────── Toast Types (Icons + Colors) ──────────
  const TOAST_TYPES = {
    success: {
      icon: `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="#43BDAB" stroke-width="2"/>
          <path d="M6 10l3 3 5-6" stroke="#43BDAB" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `,
      color: '#43BDAB'
    },
    
    error: {
      icon: `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="#ff4444" stroke-width="2"/>
          <path d="M7 7l6 6M13 7l-6 6" stroke="#ff4444" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `,
      color: '#ff4444'
    },
    
    warning: {
      icon: `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 2L2 17h16L10 2z" stroke="#ff9800" stroke-width="2" stroke-linejoin="round"/>
          <path d="M10 8v4M10 14v1" stroke="#ff9800" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `,
      color: '#ff9800'
    },
    
    info: {
      icon: `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="#2196F3" stroke-width="2"/>
          <path d="M10 6v1M10 9v5" stroke="#2196F3" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `,
      color: '#2196F3'
    }
    ,
    removed: {
      icon: `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="#ffa300" stroke-width="2"/>
          <path d="M7 10h6" stroke="#ffa300" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `,
      color: '#ffa300'
    }
  };

  // ────────── Show Toast ──────────
  function showToast(message, type = 'success', duration = 3000) {
    // Support calling with an options object: { message, type, duration, actions }
    let opts = {};
    if (message && typeof message === 'object' && !Array.isArray(message)) {
      opts.message = message.message || '';
      opts.type = message.type || 'success';
      opts.duration = (typeof message.duration === 'number') ? message.duration : 3000;
      opts.actions = Array.isArray(message.actions) ? message.actions : [];
      opts._rawHtml = !!message._rawHtml;
    } else {
      opts.message = String(message || '');
      opts.type = type || 'success';
      opts.duration = (typeof duration === 'number') ? duration : 3000;
      opts.actions = [];
    }

    // Remove toast anterior se existir
    const oldToast = document.querySelector('.toast-notification');
    if (oldToast) {
      oldToast.remove();
    }

    // Valida type
    if (!TOAST_TYPES[opts.type]) {
      console.warn(`Invalid toast type: ${opts.type}. Using 'success'.`);
      opts.type = 'success';
    }

    const toastConfig = TOAST_TYPES[opts.type];

    // Cria toast element
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-icon">
          ${toastConfig.icon}
        </div>
        <span class="toast-message">${opts._rawHtml ? opts.message : String(opts.message||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}</span>
        <button class="toast-close" aria-label="Close notification">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    `;

    // Aplica cor do tipo
    toast.style.borderColor = toastConfig.color;

    // Adiciona ao body
    document.body.appendChild(toast);

    // Trigger animation (após DOM render)
    setTimeout(() => toast.classList.add('show'), 10);

    // Render actions if provided
    if (opts.actions && opts.actions.length) {
      const actionsContainer = document.createElement('div');
      actionsContainer.className = 'toast-actions';
      opts.actions.forEach(act => {
        const btn = document.createElement('button');
        btn.className = 'toast-action-btn';
        btn.textContent = act.label || 'Action';
        btn.addEventListener('click', () => {
          try { if (typeof act.onClick === 'function') act.onClick(); } catch (e) { console.error(e); }
        });
        actionsContainer.appendChild(btn);
      });
      const content = toast.querySelector('.toast-content');
      const closeBtn = toast.querySelector('.toast-close');
      if (content && closeBtn) content.insertBefore(actionsContainer, closeBtn);
    }

    // Close button handler
    const closeBtn = toast.querySelector('.toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        hideToast(toast);
      });
    }

    // Auto-hide após duration
    if (opts.duration > 0) {
      setTimeout(() => {
        hideToast(toast);
      }, opts.duration);
    }

    return toast;
  }

  // ────────── Hide Toast ──────────
  function hideToast(toast) {
    if (!toast) return;
    
    toast.classList.remove('show');
    
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 300);
  }

  // ────────── Atalhos por tipo ──────────
  const toast = {
    success: (message, duration) => showToast(message, 'success', duration),
    error: (message, duration) => showToast(message, 'error', duration),
    warning: (message, duration) => showToast(message, 'warning', duration),
    info: (message, duration) => showToast(message, 'info', duration),
    removed: (message, duration) => showToast(message, 'removed', duration),
    show: showToast,
    hide: hideToast
  };

  // ────────── Export to Window ──────────
  window.toast = toast;

  // Drain queued calls from shim (if any)
  try {
    if (window._toastQueue && Array.isArray(window._toastQueue) && window._toastQueue.length) {
      window._toastQueue.forEach(entry => {
        try {
          const m = entry.method;
          const args = entry.args || [];
          if (m && typeof toast[m] === 'function') {
            toast[m].apply(null, args);
          } else if (m === 'show') {
            toast.show.apply(null, args);
          }
        } catch (e) {
          console.warn('Failed to replay toast queue item', e && e.message);
        }
      });
      // Clear queue after draining
      window._toastQueue = [];
    }
  } catch (e) {
    console.warn('Error while draining toast queue', e && e.message);
  }

  // ────────── Cookie Consent Helper (exposed globally) ──────────
  window.showCookieConsentToast = function() {
    try {
      if (localStorage.getItem('cookieConsent')) return;
      // show toast and keep a reference so we can style/position it as a cookie banner
      const t = toast.show({
        message: 'We use cookies to improve your experience. By continuing to browse you agree to our <a href="/cookie-policy.html" target="_blank">Cookie Policy</a>.',
        _rawHtml: true,
        type: 'info',
        duration: 0,
        actions: [
          {
            label: 'Accept',
            onClick: function() {
              localStorage.setItem('cookieConsent', 'true');
              const current = document.querySelector('.toast-notification');
              if (current) hideToast(current);
            }
          }
        ]
      });

      // Position cookie toast using a dedicated class so it appears bottom-left (standard pattern)
      try {
        if (t && t.classList) t.classList.add('toast-cookie');
      } catch (e) { /* ignore */ }
    } catch (e) {
      console.warn('showCookieConsentToast failed', e && e.message);
    }
  };

})();
