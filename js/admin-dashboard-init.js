// Admin Dashboard Initialization
import { requireAdmin, setupAdminUI, initAdminRealtimeListener } from '/js/admin-check.js';
import { initFirebase, authReady } from '/js/firebase-config.js';

// Ensure pages restored from bfcache reload to re-run init flow (auth/init/requireAdmin)
window.addEventListener('pageshow', (e) => {
  if (e.persisted) window.location.reload();
});

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Dashboard Init] Starting...');
  
  // Await Firebase init + auth restoration instead of polling
  const fb = await initFirebase();
  const auth = fb?.auth;
  console.log('[Dashboard Init] Waiting for auth restoration...');
  let user = null;
  try {
    user = await Promise.race([
      authReady,
      new Promise(res => setTimeout(() => res(null), 5000)) // 5s timeout fallback
    ]);
  } catch (e) {
    user = null;
  }
  console.log('[Dashboard Init] User found:', user?.email);

  // Ensure token is fresh (force refresh once) so claims are up-to-date, then verificar admin
  try {
    if (auth && auth.currentUser) {
      try { await auth.currentUser.getIdToken(true); } catch (e) { console.warn('ID token refresh failed (non-blocking):', e); }
    } else {
      try { console.warn('[Auth] auth or currentUser missing during dashboard init token refresh'); } catch (e) {}
    }
  } catch (e) { console.warn('Token refresh error:', e); }

  // Agora que auth foi restaurado, verificar admin
  await requireAdmin();
  console.log('[Dashboard Init] Admin verified');
  
  await setupAdminUI();
  console.log('[Dashboard Init] UI setup complete');

  // Inicializar dashboard APÓS confirmação de admin
  const adminDashboardModule = await import('/js/admin-dashboard.js');
  await adminDashboardModule.loadDashboard();
  console.log('[Dashboard Init] Dashboard loaded');

  // Attach Exit Dashboard handler (no inline JS to satisfy CSP)
  try {
    const exitBtn = document.getElementById('exitDashboardBtn');
    if (exitBtn) {
      // Ensure no leftover inline handlers
      try { exitBtn.removeAttribute('onclick'); } catch (e) {}
      exitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/';
      });
    }
  } catch (e) {
    console.warn('Could not attach exitDashboardBtn handler:', e);
  }

  // Manter UI em sincronia se a role mudar
  initAdminRealtimeListener({
    onChange: (isAdmin) => {
      if (!isAdmin) {
        alert('Seu acesso de administrador foi removido. Redirecionando.');
        window.location.href = '/';
        return;
      }
      setupAdminUI({ forceRefresh: true });
    }
  });
});
