(function () {
  const STORAGE_KEY = 'ei_newsletter_seen';
  const DELAY_MS = 25000; // 25 seconds

  function hasSeenModal() {
    try { return !!localStorage.getItem(STORAGE_KEY); } catch { return false; }
  }

  function markSeen() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
  }

  function openNewsletterModal() {
    if (hasSeenModal()) return;
    const backdrop = document.getElementById('newsletterBackdrop');
    if (!backdrop) return;
    markSeen();
    backdrop.style.display = 'flex';
    requestAnimationFrame(() => backdrop.classList.add('show'));
    setTimeout(() => {
      const input = document.getElementById('newsletterEmail');
      if (input) input.focus();
    }, 100);
  }

  // Timer trigger
  let timer = setTimeout(openNewsletterModal, DELAY_MS);

  // Exit intent trigger
  document.addEventListener('mouseleave', function (e) {
    if (e.clientY <= 0) openNewsletterModal();
  });

  // Pause timer if user leaves tab
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      clearTimeout(timer);
    } else {
      timer = setTimeout(openNewsletterModal, DELAY_MS);
    }
  });

  window.closeNewsletterModal = function () {
    const backdrop = document.getElementById('newsletterBackdrop');
    if (!backdrop) return;
    backdrop.classList.remove('show');
    setTimeout(() => { backdrop.style.display = 'none'; }, 300);
  };

  window.submitNewsletter = async function () {
    const emailInput = document.getElementById('newsletterEmail');
    const errorEl = document.getElementById('newsletterError');
    const btn = document.getElementById('newsletterSubmitBtn');
    const email = emailInput?.value?.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (errorEl) errorEl.textContent = 'Please enter a valid email address.';
      return;
    }

    if (btn) { btn.textContent = 'Submitting...'; btn.disabled = true; }
    if (errorEl) errorEl.textContent = '';

    try {
      const res = await fetch('https://ei-internal-production.up.railway.app/api/waitlist/notify-me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: 'newsletter',
          product_name: 'Newsletter Signup',
          email
        })
      });

      if (res.ok) {
        // Hide form, show success state
        const formContent = document.querySelector('#newsletterModal .modal-content:not(#newsletterSuccess)');
        const successContent = document.getElementById('newsletterSuccess');
        if (formContent) formContent.style.display = 'none';
        if (successContent) successContent.style.display = 'block';
      } else {
        const data = await res.json().catch(() => ({}));
        if (errorEl) errorEl.textContent = data.error || 'Something went wrong. Please try again.';
        if (btn) { btn.textContent = 'Get my 10% off'; btn.disabled = false; }
      }
    } catch {
      if (errorEl) errorEl.textContent = 'Connection error. Please try again.';
      if (btn) { btn.textContent = 'Get my 10% off'; btn.disabled = false; }
    }
  };

  window.copyNewsletterCode = function (btn) {
    navigator.clipboard.writeText('WELCOME10').then(() => {
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> Copy code'; }, 2000);
    }).catch(() => {
      btn.textContent = 'WELCOME10';
    });
  };
})();

