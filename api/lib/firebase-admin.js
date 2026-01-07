const admin = require('firebase-admin');

let db = null;

function initializeFirebaseAdmin() {
  // Evita reinicialização
  if (admin.apps && admin.apps.length > 0) {
    console.log('✅ Firebase Admin já inicializado');
    return admin.firestore();
  }

  try {
    const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountEnv) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT não encontrada no .env');
    }

    // Minimal logging only — avoid printing secret contents
    try {
      console.log('DEBUG: FIREBASE_SERVICE_ACCOUNT present, length=', String(serviceAccountEnv.length));
      console.log('DEBUG: FIREBASE_SERVICE_ACCOUNT appearsJSON=', serviceAccountEnv.trim().startsWith('{'));
    } catch (dbg) {
      console.log('DEBUG: FIREBASE_SERVICE_ACCOUNT previewing failed');
    }

    let serviceAccount;
    try {
      if (serviceAccountEnv.trim().startsWith('{')) {
        serviceAccount = JSON.parse(serviceAccountEnv);
      } else {
        const decoded = Buffer.from(serviceAccountEnv, 'base64').toString('utf8');
        try {
          console.log('DEBUG: decoded service account present, length=', String(decoded.length));
        } catch (dbg) {
          console.log('DEBUG: failed to inspect decoded content');
        }
        serviceAccount = JSON.parse(decoded);
      }
    } catch (parseErr) {
      console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT:', parseErr && parseErr.message);
      throw parseErr;
    }

    // Inicializa Firebase Admin com try/catch para capturar erros em runtime
    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
      console.log('✅ Firebase Admin inicializado');
      console.log('✅ Project ID:', serviceAccount.project_id);
      return admin.firestore();
    } catch (initErr) {
      console.error('❌ Error during admin.initializeApp:', initErr && initErr.message);
      console.error('❌ initializeApp stack:', initErr && initErr.stack);
      // Re-throw so callers know initialization failed
      throw initErr;
    }
  } catch (error) {
    console.error('❌ Erro ao inicializar Firebase Admin:', error.message);
    throw error;
  }
}

// Exporta função de inicialização e instância do Firestore
module.exports = {
  initializeFirebaseAdmin,
  getFirestore: () => {
    if (!db) {
      db = initializeFirebaseAdmin();
    }
    return db;
  },
  admin
};