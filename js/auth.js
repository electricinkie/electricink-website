import { initFirebase } from './firebase-config.js';

// Auth helpers (uses Firebase modular SDK via CDN)
export async function initAuth(config) {
  const { auth } = await initFirebase(config);
  return auth;
}

export async function signUp(email, password) {
  const { auth } = await initFirebase();
  const { createUserWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js');
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function signIn(email, password) {
  const { auth } = await initFirebase();
  const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js');
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signOutUser() {
  const { auth } = await initFirebase();
  const { signOut } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js');
  return signOut(auth);
}

export async function onAuthChange(cb) {
  const { auth } = await initFirebase();
  const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js');
  return onAuthStateChanged(auth, cb);
}

export async function getCurrentUser() {
  const { auth } = await initFirebase();
  return auth.currentUser || null;
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
    // Non-fatal: ensure we don't break auth flow if Firestore is unavailable
    console.warn('ensureUserProfile failed:', err);
  }
}

// ===== MODAL HTML (call `createAuthModal()` once on pages where you want it) =====
export function createAuthModal() {
  // Avoid inserting duplicate modal
  if (document.getElementById('authModal')) return;

  // If global modal system exists, reuse its styled container
  if (window.modal && typeof window.modal.create === 'function') {
    // build inner form markup (kept minimal classes; ids preserved for existing logic)
    const inner = `
      <button id="closeAuthModal" class="modal-close absolute top-4 right-4 text-gray-400 hover:text-gray-600">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>

      <div class="auth-tabs">
        <button id="loginTab" class="tab tab-active">Login</button>
        <button id="signupTab" class="tab">Sign Up</button>
      </div>

      <h2 id="authModalTitle" class="modal-title">Authentication</h2>

      <form id="loginForm" class="auth-form">
        <label>Email</label>
        <input type="email" id="loginEmail" required>
        <label>Password</label>
        <input type="password" id="loginPassword" required>
        <button type="submit" class="modal-btn modal-btn-primary">Login</button>
        <p id="loginError" class="text-red-500 text-sm hidden" role="alert" aria-live="polite"></p>
      </form>

      <form id="signupForm" class="auth-form hidden">
        <label>Name</label>
        <input type="text" id="signupName" required>
        <label>Email</label>
        <input type="email" id="signupEmail" required>
        <label>Password</label>
        <input type="password" id="signupPassword" required minlength="6">
        <button type="submit" class="modal-btn modal-btn-primary">Create Account</button>
        <p id="signupError" class="text-red-500 text-sm hidden" role="alert" aria-live="polite"></p>
      </form>
    `;

    // Create a modal via global system with empty message (we'll replace content)
    const backdrop = window.modal.create({ title: '', message: '', primaryBtn: '', secondaryBtn: null, icon: '' });
    const container = backdrop.querySelector('.modal-container');
    if (!container) return; // fallback

    // replace content and assign id for compatibility
    container.id = 'authModal';
    container.innerHTML = `<div class="modal-content">${inner}</div>`;

    // ensure close button works with global system
    const closeBtn = container.querySelector('#closeAuthModal');
    closeBtn?.addEventListener('click', () => window.modal.close());

    // initialize logic on the newly injected DOM
    initAuthModal();
    return;
  }

  // Fallback: inject local modal (keeps previous behaviour)
  const modalHTML = `
    <div id="authModal" class="fixed inset-0 bg-black/60 hidden items-center justify-center z-50" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">
      <div class="bg-white rounded-lg w-full max-w-md p-6 relative" role="document">
        <button id="closeAuthModal" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600">\n          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">\n            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>\n          </svg>\n        </button>

        <!-- Tabs -->
        <div class="flex border-b mb-6">
          <button id="loginTab" class="flex-1 pb-3 font-semibold border-b-2 border-black">Login</button>
          <button id="signupTab" class="flex-1 pb-3 font-semibold text-gray-400">Sign Up</button>
        </div>

        <!-- Login Form -->
        <h2 id="authModalTitle" class="sr-only">Authentication</h2>
        <form id="loginForm" class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">Email</label>
            <input type="email" id="loginEmail" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-black">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Password</label>
            <input type="password" id="loginPassword" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-black">
          </div>
          <button type="submit" class="w-full bg-black text-white py-2 rounded-lg hover:bg-gray-800 transition">Login</button>
          <p id="loginError" class="text-red-500 text-sm hidden" role="alert" aria-live="polite"></p>
        </form>

        <!-- Signup Form (hidden initially) -->
        <form id="signupForm" class="space-y-4 hidden">
          <div>
            <label class="block text-sm font-medium mb-1">Name</label>
            <input type="text" id="signupName" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-black">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Email</label>
            <input type="email" id="signupEmail" required class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-black">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Password</label>
            <input type="password" id="signupPassword" required minlength="6" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-black">
          </div>
          <button type="submit" class="w-full bg-black text-white py-2 rounded-lg hover:bg-gray-800 transition">Create Account</button>
          <p id="signupError" class="text-red-500 text-sm hidden" role="alert" aria-live="polite"></p>
        </form>
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

  // Close modal
  closeBtn.addEventListener('click', () => {
    if (window.modal && typeof window.modal.close === 'function') {
      window.modal.close();
    } else {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      modal.style.display = 'none';
    }
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) {
    if (window.modal && typeof window.modal.close === 'function') {
      window.modal.close();
    } else {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      modal.style.display = 'none';
    }
  }});

  // Login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    try {
      const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js');
      const { auth } = await initFirebase();
      await signInWithEmailAndPassword(auth, email, password);
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      modal.style.display = 'none';
      errorEl.classList.add('hidden');
    } catch (error) {
        console.error('Firebase signIn error (raw):', error);
      const friendly = mapAuthError(error);
      errorEl.textContent = friendly;
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
      await ensureUserProfile(userCredential.user);
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      modal.style.display = 'none';
      errorEl.classList.add('hidden');
    } catch (error) {
      console.error('Firebase signUp error (raw):', error);
      const friendly = mapAuthError(error);
      errorEl.textContent = friendly;
      errorEl.classList.remove('hidden');
    }
  });

  // Ensure initial screen is login
  try { setAuthScreen('login'); } catch (e) { /* ignore */ }
}

// Map Firebase auth errors to user-friendly messages (avoid leaking internal details)
function mapAuthError(err) {
  if (!err) return 'Authentication failed. Please try again.';
  const code = err.code || '';
  const map = {
    'auth/user-not-found': 'Account not found. Please check your email.',
    'auth/wrong-password': 'Incorrect password. Try again or reset it.',
    'auth/email-already-in-use': 'Email already registered. Try signing in.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password is too weak. Use 6+ characters.',
    'auth/network-request-failed': 'Network error. Check your connection.'
  };
  return map[code] || 'Authentication failed. Please try again.';
}

// ===== ABRIR MODAL =====
export function openAuthModal(tab = 'login') {
  let el = document.getElementById('authModal');
  if (!el) createAuthModal();
  el = document.getElementById('authModal');
  if (!el) return;

  // If using global modal system, ensure backdrop shown
  if (el.classList.contains('modal-backdrop')) {
    el.classList.add('show');
  } else if (el.classList.contains('modal-container') && el.parentElement && el.parentElement.classList.contains('modal-backdrop')) {
    el.parentElement.classList.add('show');
  } else {
    el.classList.remove('hidden');
    el.classList.add('flex');
    el.style.display = 'flex';
  }

  setAuthScreen(tab);

  // focus management: focus first input and trap focus inside modal/backdrop
  const firstInput = el.querySelector('input:not([type=hidden])');
  if (firstInput) firstInput.focus();
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
      } else {
        // Deslogado — show auth buttons, hide profile links
        authButtons.forEach(btn => btn.classList.remove('hidden'));
        profileButtons.forEach(btn => btn.classList.add('hidden'));
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
      modal.classList.add('hidden');
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
  }
}
