import { initFirebase } from './firebase-config.js';

let isAdminCache = null;

export async function isAdmin() {
  if (isAdminCache !== null) return isAdminCache;

  try {
    const { auth, db } = await initFirebase();
    const user = auth.currentUser;
    if (!user) {
      isAdminCache = false;
      return false;
    }

    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
    const snap = await getDoc(doc(db, 'admins', user.uid));
    isAdminCache = !!(snap && typeof snap.exists === 'function' ? snap.exists() : snap.exists);
    return isAdminCache;
  } catch (error) {
    console.error('Admin check failed:', error);
    isAdminCache = false;
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

export async function setupAdminUI() {
  const admin = await isAdmin();
  document.querySelectorAll('[data-admin-only]').forEach(el => {
    el.style.display = admin ? '' : 'none';
  });
  document.querySelectorAll('[data-user-only]').forEach(el => {
    el.style.display = admin ? 'none' : '';
  });
}

export function clearAdminCache() {
  isAdminCache = null;
}
