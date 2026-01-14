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
    let serviceAccountRaw = serviceAccountEnv;

    // In production we require the environment-provided service account
    // to avoid falling back to a local file that won't exist in serverless.
    const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

    // Fallback for local/dev only: try to load serviceAccountKey.json
    if (!serviceAccountRaw) {
      if (isProd) {
        console.error('❌ FATAL: FIREBASE_SERVICE_ACCOUNT not set in production environment. Admin initialization aborted.');
        throw new Error('FIREBASE_SERVICE_ACCOUNT missing in production environment');
      }
      try {
        const path = require('path');
        const fs = require('fs');
        const localPath = path.join(__dirname, '..', 'serviceAccountKey.json');
        if (fs.existsSync(localPath)) {
          console.log('DEBUG: FIREBASE_SERVICE_ACCOUNT missing; loading local serviceAccountKey.json (dev only)');
          serviceAccountRaw = fs.readFileSync(localPath, 'utf8');
        } else {
          console.error('❌ FIREBASE_SERVICE_ACCOUNT not found in env and no local serviceAccountKey.json present');
          throw new Error('FIREBASE_SERVICE_ACCOUNT not found');
        }
      } catch (e) {
        throw e;
      }
    }

    // Minimal logging only — avoid printing secret contents or metadata that
    // could help an attacker (lengths, previews). Only log presence.
    try {
      console.log('DEBUG: FIREBASE_SERVICE_ACCOUNT present');
    } catch (dbg) {
      console.log('DEBUG: FIREBASE_SERVICE_ACCOUNT previewing failed');
    }

    let serviceAccount;
    try {
      if (serviceAccountRaw.trim().startsWith('{')) {
        serviceAccount = JSON.parse(serviceAccountRaw);
      } else {
        // Assume base64-encoded JSON
        let decoded;
        try {
          decoded = Buffer.from(serviceAccountRaw, 'base64').toString('utf8');
          console.log('DEBUG: FIREBASE_SERVICE_ACCOUNT appears base64-encoded (preview suppressed)');
        } catch (decErr) {
          console.error('❌ Failed to base64-decode FIREBASE_SERVICE_ACCOUNT. Please verify environment variable encoding.');
          throw decErr;
        }
        try {
          serviceAccount = JSON.parse(decoded);
        } catch (jsonErr) {
          console.error('❌ Failed to JSON.parse decoded FIREBASE_SERVICE_ACCOUNT. Verify it is valid JSON.');
          throw jsonErr;
        }
      }
    } catch (parseErr) {
      console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT or local serviceAccountKey.json:', parseErr && parseErr.message);
      // Fail fast so callers see an explicit initialization error
      throw parseErr;
    }

    // Inicializa Firebase Admin com try/catch para capturar erros em runtime
    try {
      if (!serviceAccount || !serviceAccount.project_id) {
        console.error('❌ Parsed service account is missing required field `project_id`. Aborting admin.init.');
        throw new Error('service account missing project_id');
      }
      // Ensure minimal required fields exist to avoid silent runtime failures
      if (!serviceAccount.client_email) {
        console.error('❌ Parsed service account is missing required field `client_email`. Aborting admin.init.');
        throw new Error('service account missing client_email');
      }
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