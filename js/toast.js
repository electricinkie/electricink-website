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
  };

  // ────────── Show Toast ──────────
  function showToast(message, type = 'success', duration = 3000) {
    // Remove toast anterior se existir
    const oldToast = document.querySelector('.toast-notification');
    if (oldToast) {
      oldToast.remove();
    }

    // Valida type
    if (!TOAST_TYPES[type]) {
      console.warn(`Invalid toast type: ${type}. Using 'success'.`);
        // ────────── Consent Banner ──────────
        window.showCookieConsentToast = function() {
          if (localStorage.getItem('cookieConsent')) return;
          window.showToast({
            type: 'info',
            message: 'Este site utiliza cookies para melhorar sua experiência. Ao continuar navegando, você concorda com nossa <a href="/cookie-policy.html" target="_blank">Política de Cookies</a>.',
            duration: 0,
            actions: [
              {
                label: 'Aceitar',
                onClick: function() {
                  localStorage.setItem('cookieConsent', 'true');
                  window.hideToast();
                }
              }
            ]
          });
        };
      type = 'success';
    }

    const toastConfig = TOAST_TYPES[type];

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
        <span class="toast-message">${message}</span>
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

    // Close button handler
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
      hideToast(toast);
    });

    // Auto-hide após duration
    if (duration > 0) {
      setTimeout(() => {
        hideToast(toast);
      }, duration);
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
    show: showToast,
    hide: hideToast
  };

  // ────────── Export to Window ──────────
  window.toast = toast;

})();
