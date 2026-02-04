const admin = require('firebase-admin');
const logger = require('./logger');

let db = null;

function initializeFirebaseAdmin() {
  // Evita reinicialização
  if (admin.apps && admin.apps.length > 0) {
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Firebase Admin already initialized');
    }
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
        logger.error('FATAL: FIREBASE_SERVICE_ACCOUNT not set in production environment');
        throw new Error('FIREBASE_SERVICE_ACCOUNT missing in production environment');
      }
      try {
        const path = require('path');
        const fs = require('fs');
        const localPath = path.join(__dirname, '..', 'serviceAccountKey.json');
        if (fs.existsSync(localPath)) {
          if (process.env.NODE_ENV === 'development') {
            logger.debug('Loading local serviceAccountKey.json (dev only)');
          }
          serviceAccountRaw = fs.readFileSync(localPath, 'utf8');
        } else {
          logger.error('FIREBASE_SERVICE_ACCOUNT not found in env and no local serviceAccountKey.json present');
          throw new Error('FIREBASE_SERVICE_ACCOUNT not found');
        }
      } catch (e) {
        throw e;
      }
    }

    // Minimal logging only — avoid printing secret contents or metadata.
    // Presence of service account is noted; avoid further previews.

    let serviceAccount;
    try {
      if (serviceAccountRaw.trim().startsWith('{')) {
        serviceAccount = JSON.parse(serviceAccountRaw);
      } else {
        // Assume base64-encoded JSON
        let decoded;
        try {
          decoded = Buffer.from(serviceAccountRaw, 'base64').toString('utf8');
          if (process.env.NODE_ENV === 'development') {
            logger.debug('FIREBASE_SERVICE_ACCOUNT appears base64-encoded');
          }
        } catch (decErr) {
          logger.error('Failed to base64-decode FIREBASE_SERVICE_ACCOUNT', decErr);
          throw decErr;
        }
        try {
          serviceAccount = JSON.parse(decoded);
        } catch (jsonErr) {
          logger.error('Failed to JSON.parse decoded FIREBASE_SERVICE_ACCOUNT', jsonErr);
          throw jsonErr;
        }
      }
    } catch (parseErr) {
      logger.error('Failed to parse FIREBASE_SERVICE_ACCOUNT or local serviceAccountKey.json', parseErr);
      // Fail fast so callers see an explicit initialization error
      throw parseErr;
    }

    // Inicializa Firebase Admin com try/catch para capturar erros em runtime
    try {
      if (!serviceAccount || !serviceAccount.project_id) {
        logger.error('Parsed service account is missing required field project_id');
        throw new Error('service account missing project_id');
      }
      // Ensure minimal required fields exist to avoid silent runtime failures
      if (!serviceAccount.client_email) {
        logger.error('Parsed service account is missing required field client_email');
        throw new Error('service account missing client_email');
      }
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
      logger.info('Firebase Admin initialized');
      return admin.firestore();
    } catch (initErr) {
      logger.error('Error during admin.initializeApp', initErr);
      // Re-throw so callers know initialization failed
      throw initErr;
    }
  } catch (error) {
    logger.error('Erro ao inicializar Firebase Admin', error);
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