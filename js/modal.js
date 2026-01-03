// ========================================
// GLOBAL MODAL SYSTEM
// Electric Ink IE
// ========================================

(function() {
  'use strict';

  let activeModal = null;

  // ────────── Modal Types Config ──────────
  const MODAL_TYPES = {
    confirm: {
      icon: `
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" stroke="#43BDAB" stroke-width="3"/>
          <path d="M24 14v14M24 32v2" stroke="#43BDAB" stroke-width="3" stroke-linecap="round"/>
        </svg>
      `,
      primaryBtn: 'Confirm',
      secondaryBtn: 'Cancel'
    },
    
    delete: {
      icon: `
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" stroke="#ff4444" stroke-width="3"/>
          <path d="M16 16l16 16M32 16L16 32" stroke="#ff4444" stroke-width="3" stroke-linecap="round"/>
        </svg>
      `,
      primaryBtn: 'Delete',
      secondaryBtn: 'Cancel'
    },
    
    alert: {
      icon: `
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" stroke="#2196F3" stroke-width="3"/>
          <path d="M24 14v14M24 32v2" stroke="#2196F3" stroke-width="3" stroke-linecap="round"/>
        </svg>
      `,
      primaryBtn: 'OK',
      secondaryBtn: null
    },
    
    success: {
      icon: `
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" stroke="#43BDAB" stroke-width="3"/>
          <path d="M14 24l8 8L34 16" stroke="#43BDAB" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `,
      primaryBtn: 'OK',
      secondaryBtn: null
    }
  };

  // ────────── Create Modal ──────────
  function createModal(options) {
    const {
      type = 'confirm',
      title = 'Confirm',
      message = '',
      primaryBtn,
      secondaryBtn,
      onConfirm,
      onCancel,
      icon
    } = options;

    // Get type config
    const config = MODAL_TYPES[type] || MODAL_TYPES.confirm;

    // Remove existing modal
    if (activeModal) {
      closeModal();
    }

    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'modal-title');

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal-container';
    
    // Icon
    const modalIcon = icon || config.icon;
    
    // Buttons
    const primaryBtnText = primaryBtn || config.primaryBtn;
    const secondaryBtnText = secondaryBtn !== undefined ? secondaryBtn : config.secondaryBtn;

    modal.innerHTML = `
      <div class="modal-content">
        ${modalIcon ? `<div class="modal-icon">${modalIcon}</div>` : ''}
        
        <h2 class="modal-title" id="modal-title">${title}</h2>
        
        ${message ? `<p class="modal-message">${message}</p>` : ''}
        
        <div class="modal-actions">
          ${secondaryBtnText ? `<button class="modal-btn modal-btn-secondary" data-action="cancel">${secondaryBtnText}</button>` : ''}
          <button class="modal-btn modal-btn-primary" data-action="confirm">${primaryBtnText}</button>
        </div>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Trigger animation
    requestAnimationFrame(() => {
      backdrop.classList.add('show');
    });

    // Store active modal
    activeModal = backdrop;

    // Event listeners
    const primaryBtnEl = modal.querySelector('[data-action="confirm"]');
    const secondaryBtnEl = modal.querySelector('[data-action="cancel"]');

    primaryBtnEl.addEventListener('click', () => {
      closeModal();
      if (onConfirm) onConfirm();
    });

    if (secondaryBtnEl) {
      secondaryBtnEl.addEventListener('click', () => {
        closeModal();
        if (onCancel) onCancel();
      });
    }

    // Close on backdrop click
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeModal();
        if (onCancel) onCancel();
      }
    });

    // Close on ESC key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        if (onCancel) onCancel();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Focus primary button
    setTimeout(() => primaryBtnEl.focus(), 100);

    return backdrop;
  }

  // ────────── Close Modal ──────────
  function closeModal() {
    if (!activeModal) return;

    activeModal.classList.remove('show');
    
    setTimeout(() => {
      if (activeModal && activeModal.parentNode) {
        activeModal.remove();
      }
      activeModal = null;
      document.body.style.overflow = '';
    }, 300);
  }

  // ────────── Promise-based API ──────────
  function confirm(options) {
    return new Promise((resolve) => {
      if (typeof options === 'string') {
        options = { message: options };
      }

      createModal({
        type: 'confirm',
        title: options.title || 'Confirm',
        message: options.message,
        primaryBtn: options.primaryBtn,
        secondaryBtn: options.secondaryBtn,
        icon: options.icon,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
  }

  function deleteConfirm(options) {
    return new Promise((resolve) => {
      if (typeof options === 'string') {
        options = { message: options };
      }

      createModal({
        type: 'delete',
        title: options.title || 'Delete Item',
        message: options.message,
        primaryBtn: options.primaryBtn,
        secondaryBtn: options.secondaryBtn,
        icon: options.icon,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
  }

  function alert(options) {
    return new Promise((resolve) => {
      if (typeof options === 'string') {
        options = { message: options };
      }

      createModal({
        type: 'alert',
        title: options.title || 'Alert',
        message: options.message,
        primaryBtn: options.primaryBtn,
        icon: options.icon,
        onConfirm: () => resolve(true)
      });
    });
  }

  function success(options) {
    return new Promise((resolve) => {
      if (typeof options === 'string') {
        options = { message: options };
      }

      createModal({
        type: 'success',
        title: options.title || 'Success',
        message: options.message,
        primaryBtn: options.primaryBtn,
        icon: options.icon,
        onConfirm: () => resolve(true)
      });
    });
  }

  // ────────── Export to Window ──────────
  window.modal = {
    confirm,
    delete: deleteConfirm,
    alert,
    success,
    create: createModal,
    close: closeModal
  };

})();
