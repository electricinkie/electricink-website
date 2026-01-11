import { initFirebase } from './firebase-config.js';

// Auth helpers (uses Firebase modular SDK via CDN)
export async function initAuth(config) {
  const { auth } = await initFirebase(config);
  return auth;
}

export async function signUp(email, password) {
  try {
    const { auth } = await initFirebase();
    const { createUserWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js');
    return await createUserWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error('Auth signUp error:', { code: err?.code, message: err?.message, raw: err });
    throw err;
  }
}

export async function signIn(email, password) {
  try {
    const { auth } = await initFirebase();
    const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js');
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error('Auth signIn error:', { code: err?.code, message: err?.message, raw: err });
    throw err;
  }
}

export async function signOutUser() {
  const { auth } = await initFirebase();
  const { signOut } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js');
  return signOut(auth);
}

export async function onAuthChange(cb) {
  try {
    const { auth } = await initFirebase();
    if (!auth) {
      console.warn('[Auth] Auth not initialized');
      return;
    }
    const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js');
    return onAuthStateChanged(auth, (user) => {
      if (user) {
        try { console.log('[Auth] ✅ User signed in:', user.email); } catch (e) {}
      } else {
        try { console.log('[Auth] ℹ️ User signed out'); } catch (e) {}
      }
      try { cb(user); } catch (e) { console.error('[Auth] onAuthChange callback error:', e); }
    });
  } catch (e) {
    console.warn('[Auth] onAuthChange failed:', e && e.message);
    return;
  }
}

export async function getCurrentUser() {
  const { auth } = await initFirebase();
  return auth.currentUser;
}

// Ensure a Firestore `users/{uid}` document exists for the authenticated user
export async function ensureUserProfile(user) {
  if (!user) return;
  try {
    const { uid, email, displayName } = user;
    const { db } = await initFirebase();
    const { doc, getDoc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        email: email || '',
        name: displayName || '',
        discount: 0,
        createdAt: serverTimestamp()
      });
    } else {
      const data = snap.data() || {};
      const updates = {};
      if (!data.email && email) updates.email = email;
      if (!data.name && displayName) updates.name = displayName;
      if (Object.keys(updates).length) {
        await setDoc(ref, updates, { merge: true });
      }
    }
  } catch (err) {
    console.warn('ensureUserProfile failed:', err);
  }
}

// ===== MODAL HTML (call `createAuthModal()` once on pages where you want it) =====
export function createAuthModal() {
  // Avoid inserting duplicate modal
  if (document.getElementById('authModal')) return;

  // Fallback: inject local modal with perfect inline styles
  const modalHTML = `
    <div id="authModal" role="dialog" aria-modal="true" aria-labelledby="authModalTitle" 
      style="
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        z-index: 999999;
        padding: 20px;
      ">
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100%;
        width: 100%;
      ">
        <div class="modal-content" role="document" 
          style="
            background: white;
            border-radius: 16px;
            padding: 40px;
            max-width: 440px;
            width: 100%;
            position: relative;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            margin: auto;
          ">
          <button id="closeAuthModal" 
            style="
              position: absolute;
              top: 16px;
              right: 16px;
              background: transparent;
              border: none;
              padding: 8px;
              cursor: pointer;
              color: #9ca3af;
              border-radius: 6px;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: background 0.2s ease;
            "
            >
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>

          <!-- Tabs -->
          <div style="display: flex; gap: 0; margin-bottom: 32px; border-bottom: 2px solid #e5e7eb; justify-content: center;">
            <button id="loginTab" 
              style="
                padding: 12px 32px;
                background: transparent;
                border: none;
                border-bottom: 3px solid #43BDAB;
                color: #111827;
                font-weight: 600;
                font-size: 15px;
                cursor: pointer;
                margin-bottom: -2px;
                transition: all 0.2s ease;
              ">Sign in</button>
            <button id="signupTab" 
              style="
                padding: 12px 32px;
                background: transparent;
                border: none;
                border-bottom: 3px solid transparent;
                color: #6b7280;
                font-weight: 600;
                font-size: 15px;
                cursor: pointer;
                margin-bottom: -2px;
                transition: all 0.2s ease;
              ">Create account</button>
          </div>

          <!-- Title -->
          <h2 id="authModalTitle" style="font-size: 24px; font-weight: 700; color: #111827; margin-bottom: 8px; text-align: center;">Welcome back</h2>
          <p id="authModalSubtitle" style="font-size: 14px; color: #6b7280; text-align: center; margin-bottom: 24px;">Sign in to access your orders and exclusive offers</p>

          <!-- Login Form -->
          <form id="loginForm" style="display: flex; flex-direction: column; gap: 18px;">
            <div>
              <label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px;">Email address</label>
              <input type="email" id="loginEmail" required placeholder="you@example.com" 
                style="
                  width: 100%;
                  padding: 12px 14px;
                  border: 2px solid #e5e7eb;
                  border-radius: 8px;
                  font-size: 15px;
                  font-family: inherit;
                  transition: border-color 0.2s ease;
                  box-sizing: border-box;
                "
                    >
            </div>
            <div>
              <label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px;">Password</label>
              <input type="password" id="loginPassword" required placeholder="Enter your password"
                autocomplete="current-password" autocorrect="off" autocapitalize="off" spellcheck="false"
                style="
                  width: 100%;
                  padding: 12px 14px;
                  border: 2px solid #e5e7eb;
                  border-radius: 8px;
                  font-size: 15px;
                  font-family: inherit;
                  transition: border-color 0.2s ease;
                  box-sizing: border-box;
                "
                  >
            </div>
            <button type="submit" 
              style="
                width: 100%;
                padding: 14px;
                background: #43BDAB;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                margin-top: 8px;
                transition: all 0.2s ease;
              "
              onmouseover="this.style.background='#2dd4bf'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px rgba(67, 189, 171, 0.3)'"
              
              >Sign in</button>
            <p id="loginError" style="display: none; color: #dc2626; font-size: 13px; padding: 12px; background: #fef2f2; border-radius: 8px; border-left: 3px solid #dc2626; margin-top: 4px;"></p>
          </form>

          <!-- Signup Form (hidden initially) -->
          <form id="signupForm" style="display: none; flex-direction: column; gap: 18px;">
            <div>
              <label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px;">Full name</label>
              <input type="text" id="signupName" required placeholder="John Doe" 
                style="
                  width: 100%;
                  padding: 12px 14px;
                  border: 2px solid #e5e7eb;
                  border-radius: 8px;
                  font-size: 15px;
                  font-family: inherit;
                  transition: border-color 0.2s ease;
                  box-sizing: border-box;
                "
                onfocus="this.style.borderColor='#43BDAB'; this.style.boxShadow='0 0 0 3px rgba(67, 189, 171, 0.1)'"
                onblur="this.style.borderColor='#e5e7eb'; this.style.boxShadow='none'">
            </div>
            <div>
              <label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px;">Email address</label>
              <input type="email" id="signupEmail" required placeholder="you@example.com" 
                style="
                  width: 100%;
                  padding: 12px 14px;
                  border: 2px solid #e5e7eb;
                  border-radius: 8px;
                  font-size: 15px;
                  font-family: inherit;
                  transition: border-color 0.2s ease;
                  box-sizing: border-box;
                "
                onfocus="this.style.borderColor='#43BDAB'; this.style.boxShadow='0 0 0 3px rgba(67, 189, 171, 0.1)'"
                onblur="this.style.borderColor='#e5e7eb'; this.style.boxShadow='none'">
            </div>
            <div>
              <label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px;">Password</label>
              <input type="password" id="signupPassword" required minlength="6" placeholder="At least 6 characters"
                autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false"
                style="
                  width: 100%;
                  padding: 12px 14px;
                  border: 2px solid #e5e7eb;
                  border-radius: 8px;
                  font-size: 15px;
                  font-family: inherit;
                  transition: border-color 0.2s ease;
                  box-sizing: border-box;
                "
                  >
            <p style="font-size: 12px; color: #6b7280; margin-top: 4px;">Minimum 6 characters</p>
            </div>
            <button type="submit" 
              style="
                width: 100%;
                padding: 14px;
                background: #43BDAB;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                margin-top: 8px;
                transition: all 0.2s ease;
              "
              
              >Create account</button>
            <p id="signupError" style="display: none; color: #dc2626; font-size: 13px; padding: 12px; background: #fef2f2; border-radius: 8px; border-left: 3px solid #dc2626; margin-top: 4px;"></p>
          </form>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  initAuthModal();
}

// ===== LÓGICA DO MODAL =====
function initAuthModal() {
  const modal = document.getElementById('authModal');
  const loginTab = document.getElementById('loginTab');
  const signupTab = document.getElementById('signupTab');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const closeBtn = document.getElementById('closeAuthModal');

  // Switch tabs
  loginTab.addEventListener('click', () => setAuthScreen('login'));
  signupTab.addEventListener('click', () => setAuthScreen('signup'));

  // Close modal (use helper to animate cleanly)
  closeBtn.addEventListener('click', () => closeAuthModal());
  modal.addEventListener('click', (e) => { if (e.target === modal) { closeAuthModal(); }});

  // Login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    try {
      const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js');
      const { auth } = await initFirebase();
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      try { console.log('[Auth] ✅ Login successful:', userCredential.user.email); } catch (e) {}
      // Hide errors early
      try { errorEl.style.display = 'none'; } catch (e) {}
      errorEl.classList.add('hidden');

      // Stronger post-login admin detection flow:
      // 1) Force token refresh, 2) clear cache, 3) run immediate admin check + UI setup.
      try {
        const { clearAdminCache, isAdmin, setupAdminUI } = await import('./admin-check.js');
        try { await userCredential.user.getIdToken(true); } catch (e) { console.warn('Token refresh failed', e); }
        try { clearAdminCache(); } catch (e) { console.warn('clearAdminCache failed', e); }
        try {
          const admin = await isAdmin({ user: userCredential.user, forceRefresh: true });
          if (admin) {
            try { await setupAdminUI({ forceRefresh: true }); } catch (e) { console.warn('setupAdminUI failed', e); }
          }
        } catch (e) {
          console.warn('Immediate admin check failed', e);
        }
      } catch (e) {
        console.log('Admin post-login flow skipped', e);
      }

      // Close modal before showing toast
      closeAuthModal();
      await new Promise(resolve => setTimeout(resolve, 300));

      if (window.toast && typeof window.toast.show === 'function') {
        window.toast.show('Welcome back!', 'success');
      }

      // Force immediate UI update rather than waiting for observer (improves perceived latency)
      setTimeout(() => {
        const out = document.querySelector('[data-auth-signed-out]');
        const inEl = document.querySelector('[data-auth-signed-in]');
        if (out) out.style.display = 'none';
        if (inEl) inEl.style.display = 'flex';
        const nameEl = document.querySelector('.user-name');
        if (nameEl) nameEl.textContent = userCredential.user.displayName || (userCredential.user.email ? userCredential.user.email.split('@')[0] : 'User');
      }, 100);

    } catch (error) {
      console.error('Firebase signIn error (raw):', error);
      const friendly = mapAuthError(error);
      errorEl.textContent = friendly;
      errorEl.style.display = 'block';
      errorEl.classList.remove('hidden');
    }
  });

  // Signup
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const errorEl = document.getElementById('signupError');
    try {
      const { createUserWithEmailAndPassword, updateProfile } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js');
      const { auth } = await initFirebase();
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: name });
      try { console.log('[Auth] ✅ Signup successful:', userCredential.user.email); } catch (e) {}
      await ensureUserProfile(userCredential.user);

      try { errorEl.style.display = 'none'; } catch (e) {}
      errorEl.classList.add('hidden');

      // Close modal and wait for animation
      closeAuthModal();
      await new Promise(resolve => setTimeout(resolve, 300));

      if (window.toast && typeof window.toast.show === 'function') {
        window.toast.show('Account created successfully! Welcome to Electric Ink.', 'success');
      }

      // Force UI update
      setTimeout(() => {
        const out = document.querySelector('[data-auth-signed-out]');
        const inEl = document.querySelector('[data-auth-signed-in]');
        if (out) out.style.display = 'none';
        if (inEl) inEl.style.display = 'flex';
        const nameEl = document.querySelector('.user-name');
        if (nameEl) nameEl.textContent = name;
      }, 100);
    } catch (error) {
      console.error('Firebase signUp error (raw):', error);
      const friendly = mapAuthError(error);
      errorEl.textContent = friendly;
      errorEl.style.display = 'block';
      errorEl.classList.remove('hidden');
    }
  });

  // Ensure initial screen is login
  try { setAuthScreen('login'); } catch (e) { /* ignore */ }
  // Add hover/focus styles via CSS (avoid inline handlers for CSP)
  try {
    const style = document.createElement('style');
    style.textContent = `
      #authModal input:focus {
        outline: none;
        border-color: #43BDAB !important;
        box-shadow: 0 0 0 3px rgba(67, 189, 171, 0.1) !important;
      }
      #authModal button[type="submit"]:hover {
        background: #2dd4bf !important;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(67, 189, 171, 0.3);
      }
      #authModal button[type="submit"]:active {
        transform: translateY(0);
      }
      #authModal #closeAuthModal:hover {
        background: #f3f4f6;
        color: #374151;
      }
    `;
    document.head.appendChild(style);
  } catch (e) { /* ignore style injection errors */ }
}

  // Smoothly close the auth modal with a fade-out to avoid visual glitch
  export function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    // If using global modal system, prefer its close handler but still
    // fall back to the local modal hide logic so auth modal always closes.
    if (window.modal && typeof window.modal.close === 'function') {
      try { window.modal.close(); } catch (e) { /* ignore */ }
    }

    // Remove any previous closing marker, then add closing marker
    modal.classList.remove('modal-closing');
    // Ensure modal is visible when starting fade (in case called while hidden)
    modal.style.display = modal.style.display || 'flex';
    // Kick off fade
    modal.classList.add('modal-closing');
    // After transition, hide completely
    const timeout = 300;
    setTimeout(() => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      modal.style.display = 'none';
      modal.classList.remove('modal-closing');
    }, timeout);
  }

// Map Firebase auth errors to user-friendly messages (avoid leaking internal details)
function mapAuthError(err) {
  if (!err) return 'Something went wrong. Please try again.';
  const code = err.code || '';
  const map = {
    'auth/user-not-found': 'No account found with this email. Want to create one?',
    'auth/wrong-password': 'Incorrect password. Try again or reset it.',
    'auth/email-already-in-use': 'This email is already registered. Sign in instead?',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password should be at least 6 characters long.',
    'auth/network-request-failed': 'Connection issue. Please check your internet.',
    'auth/too-many-requests': 'Too many attempts. Take a break and try again in a few minutes.'
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// ===== ABRIR MODAL =====
export function openAuthModal(tab = 'login') {
  let el = document.getElementById('authModal');
  if (!el) createAuthModal();
  el = document.getElementById('authModal');
  if (!el) {
    console.error('Could not create auth modal');
    return;
  }

  // Force modal visible with high-priority inline styles
  el.style.display = 'flex';
  el.style.opacity = '1';
  el.style.visibility = 'visible';
  el.classList.remove('hidden');
  el.classList.remove('modal-closing');
  el.classList.add('flex');

  // Ensure auth modal is on top of any other modal/backdrop
  try { el.style.zIndex = '1000000'; } catch (e) { /* ignore style errors */ }

  // Force inner content visible
  const inner = el.querySelector('.modal-content');
  if (inner) {
    inner.style.display = 'block';
    inner.style.opacity = '1';
    inner.style.visibility = 'visible';
    inner.style.transform = 'none';
  }

  // If auth modal is actually a modal-container created by the global modal
  // system, ensure its backdrop is visible and has high z-index.
  try {
    if (el.classList.contains('modal-container') && el.parentElement && el.parentElement.classList.contains('modal-backdrop')) {
      const backdrop = el.parentElement;
      backdrop.style.display = 'flex';
      backdrop.classList.add('show');
      backdrop.style.zIndex = '999999';
      // also ensure container is on top
      el.style.zIndex = '1000000';
    }
  } catch (e) { /* ignore */ }

  // Set tab
  setAuthScreen(tab);

  // Focus first input slightly delayed to allow DOM to settle
  setTimeout(() => {
    const firstInput = el.querySelector('input:not([type=hidden])');
    if (firstInput) firstInput.focus();
  }, 50);

  // Trap focus
  addFocusTrap(el);
}

export function openLoginModal() { openAuthModal('login'); }
export function openSignupModal() { openAuthModal('signup'); }

// ===== LOGOUT =====
export async function logout() {
  const { auth } = await initFirebase();
  const { signOut } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js');
  return signOut(auth);
}

// ===== OBSERVER (atualiza UI quando user loga/desloga) =====
export async function initAuthObserver() {
  // support multiple locations: header and mobile menu
  const authButtons = Array.from(document.querySelectorAll('#authButton, #mobile-auth-button'));
  const profileButtons = Array.from(document.querySelectorAll('#profileButton, #mobile-profile-button'));
  try {
    const { auth } = await initFirebase();
    const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js');
    onAuthStateChanged(auth, (user) => {
      if (user) {
        // Ensure user profile document exists (non-blocking)
        ensureUserProfile(user).catch(() => {});
        // Logado — hide all auth buttons, show all profile links and set name
        authButtons.forEach(btn => btn.classList.add('hidden'));
        profileButtons.forEach(btn => {
          btn.classList.remove('hidden');
          const span = btn.querySelector('span');
          if (span) span.textContent = user.displayName || 'Profile';
        });

        // Show admin links if user has admin claim
        (async () => {
          try {
            const { getIdTokenResult } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js');
            const idRes = await getIdTokenResult(user);
            const isAdmin = !!(idRes && idRes.claims && idRes.claims.admin);
            const adminLink = document.getElementById('adminLink');
            const mobileAdminLink = document.getElementById('mobile-admin-link');
            if (adminLink) adminLink.style.display = isAdmin ? 'inline-block' : 'none';
            if (mobileAdminLink) mobileAdminLink.style.display = isAdmin ? 'block' : 'none';
          } catch (e) {
            // Non-fatal
            console.warn('Could not verify admin claim:', e);
          }
        })();
      } else {
        // Deslogado — show auth buttons, hide profile links
        authButtons.forEach(btn => btn.classList.remove('hidden'));
        profileButtons.forEach(btn => btn.classList.add('hidden'));
        const adminLink = document.getElementById('adminLink');
        const mobileAdminLink = document.getElementById('mobile-admin-link');
        if (adminLink) adminLink.style.display = 'none';
        if (mobileAdminLink) mobileAdminLink.style.display = 'none';
      }
    });
  } catch (err) {
    // FIREBASE_CONFIG may be missing or init failed; silently skip observer
    return;
  }
}

function addFocusTrap(modal) {
  if (!modal) return;
  const focusable = Array.from(modal.querySelectorAll('a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'));
  if (focusable.length === 0) return;
  let first = focusable[0];
  let last = focusable[focusable.length - 1];

  function keyHandler(e) {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    if (e.key === 'Escape') {
      closeAuthModal();
      document.removeEventListener('keydown', keyHandler);
    }
  }

  document.addEventListener('keydown', keyHandler);
}

function setAuthScreen(screen) {
  const loginTab = document.getElementById('loginTab');
  const signupTab = document.getElementById('signupTab');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const titleEl = document.getElementById('authModalTitle');
  const subtitleEl = document.getElementById('authModalSubtitle');
  if (!loginTab || !signupTab || !loginForm || !signupForm) return;
  if (screen === 'signup') {
    // tab styles vary between global modal and fallback
    loginTab.classList.remove('tab-active');
    signupTab.classList.add('tab-active');
    // fallback classes
    loginTab.classList.remove('border-black', 'text-black');
    signupTab.classList.add('border-black', 'text-black');
    signupTab.classList.remove('text-gray-400');
    loginTab.classList.add('text-gray-400');
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
    // Ensure inline display for non-utility CSS setups
    loginForm.style.display = 'none';
    signupForm.style.display = 'block';
    if (titleEl) titleEl.textContent = 'Create your account';
    if (subtitleEl) subtitleEl.textContent = "Join Dublin's tattoo community";
  } else {
    signupTab.classList.remove('tab-active');
    loginTab.classList.add('tab-active');
    signupTab.classList.remove('border-black', 'text-black');
    loginTab.classList.add('border-black', 'text-black');
    loginTab.classList.remove('text-gray-400');
    signupTab.classList.add('text-gray-400');
    signupForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    // Ensure inline display for non-utility CSS setups
    signupForm.style.display = 'none';
    loginForm.style.display = 'block';
    if (titleEl) titleEl.textContent = 'Welcome back';
    if (subtitleEl) subtitleEl.textContent = 'Sign in to access your orders and exclusive offers';
  }
}
