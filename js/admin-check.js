import { initFirebase } from './firebase-config.js';

let isAdminCache = null;
let isAdminCacheAt = 0; // epoch ms of last resolution
const ADMIN_CACHE_TTL_MS = 5 * 1000; // 5s TTL (reduced to react faster to role changes)

export async function isAdmin({ user: providedUser = null, forceRefresh = false } = {}) {
  // TTL check: reuse cache if valid and not forced
  const now = Date.now();
  if (!forceRefresh && isAdminCache !== null && (now - isAdminCacheAt) < ADMIN_CACHE_TTL_MS) {
    return isAdminCache;
  }

  try {
    const { auth, db } = await initFirebase();
    const user = providedUser || auth.currentUser;
    if (!user) {
      isAdminCache = false;
      isAdminCacheAt = now;
      return false;
    }

    // First prefer token-based custom claim check (fast, secure)
    try {
      const idRes = await user.getIdTokenResult();
      if (idRes && idRes.claims && idRes.claims.admin) {
        isAdminCache = true;
        isAdminCacheAt = now;
        return true;
      }
    } catch (e) {
      // ignore token-read errors and fallback to admins collection
    }

    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
    const snap = await getDoc(doc(db, 'admins', user.uid));
    isAdminCache = !!(snap && typeof snap.exists === 'function' ? snap.exists() : snap.exists);
    isAdminCacheAt = now;
    return isAdminCache;
  } catch (error) {
    console.error('Admin check failed:', error);
    isAdminCache = false;
    isAdminCacheAt = now;
    return false;
  }
}

export async function requireAdmin() {
  const admin = await isAdmin();
  if (!admin) {
    alert('Acesso negado. Apenas administradores.');
    window.location.href = '/';
    return false;
  }
  return true;
}

export async function setupAdminUI({ forceRefresh = false } = {}) {
  const admin = await isAdmin({ forceRefresh });
  document.querySelectorAll('[data-admin-only]').forEach(el => {
    el.style.display = admin ? '' : 'none';
  });
  document.querySelectorAll('[data-user-only]').forEach(el => {
    el.style.display = admin ? 'none' : '';
  });
}

export function clearAdminCache() {
  isAdminCache = null;
  isAdminCacheAt = 0;
}

// Optional realtime listener for admin pages
// Call initAdminRealtimeListener() at the top of admin pages to react instantly
export async function initAdminRealtimeListener({ onChange } = {}) {
  try {
    const { auth, db } = await initFirebase();
    const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js');
    const { doc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');

    let unsubscribe = null;

    onAuthStateChanged(auth, (user) => {
      // On user switch, clear cache and rewire listener
      clearAdminCache();
      if (unsubscribe) {
        try { unsubscribe(); } catch (_) {}
        unsubscribe = null;
      }
      if (user) {
        unsubscribe = onSnapshot(doc(db, 'admins', user.uid), (snap) => {
          const exists = !!(snap && typeof snap.exists === 'function' ? snap.exists() : snap.exists);
          // Update cache and timestamp immediately
          isAdminCache = exists;
          isAdminCacheAt = Date.now();
          if (typeof onChange === 'function') {
            try { onChange(exists); } catch (e) { console.error('onChange handler failed', e); }
          }
        }, (err) => {
          console.error('Admin snapshot error:', err);
          // On error, mark as non-admin but keep short TTL
          isAdminCache = false;
          isAdminCacheAt = Date.now();
        });
      } else {
        // No user
        isAdminCache = false;
        isAdminCacheAt = Date.now();
        if (typeof onChange === 'function') {
          try { onChange(false); } catch (e) { console.error('onChange handler failed', e); }
        }
      }
    });

    return () => {
      if (unsubscribe) {
        try { unsubscribe(); } catch (_) {}
      }
    };
  } catch (e) {
    console.error('Failed to init admin realtime listener:', e);
    return () => {};
  }
}
