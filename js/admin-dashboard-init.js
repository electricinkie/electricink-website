// Admin Dashboard Initialization
import { requireAdmin, setupAdminUI, initAdminRealtimeListener } from '/js/admin-check.js';
import { getCurrentUser } from '/js/auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Dashboard Init] Starting...');
  
  // Poll para restaurar auth antes de verificar admin
  let user = null;
  for (let i = 0; i < 6; i++) {
    try { 
      user = await getCurrentUser(); 
    } catch (e) { 
      user = null; 
    }
    if (user) break;
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('[Dashboard Init] User found:', user?.email);

  // Agora que auth foi restaurado, verificar admin
  await requireAdmin();
  console.log('[Dashboard Init] Admin verified');
  
  await setupAdminUI();
  console.log('[Dashboard Init] UI setup complete');

  // Inicializar dashboard APÓS confirmação de admin
  const adminDashboardModule = await import('/js/admin-dashboard.js');
  await adminDashboardModule.loadDashboard();
  console.log('[Dashboard Init] Dashboard loaded');

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
