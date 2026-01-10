#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Read env vars (set these in Vercel/CI):
const {
  FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
  FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_APP_ID,
  FIREBASE_MEASUREMENT_ID
} = process.env;

if (!FIREBASE_API_KEY) {
  console.log('No FIREBASE_API_KEY provided — skipping firebase config injection');
  process.exit(0);
}

const cfg = {
  apiKey: FIREBASE_API_KEY,
  authDomain: FIREBASE_AUTH_DOMAIN || '',
  projectId: FIREBASE_PROJECT_ID || '',
  storageBucket: FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: FIREBASE_MESSAGING_SENDER_ID || '',
  appId: FIREBASE_APP_ID || '',
  measurementId: FIREBASE_MEASUREMENT_ID || ''
};

const outPath = path.resolve(__dirname, '..', 'js', 'firebase-client-config.js');
const content = `// THIS FILE IS GENERATED AT BUILD TIME. DO NOT EDIT.
(function () {
  window.FIREBASE_CONFIG = ${JSON.stringify(cfg, null, 2)};
  console.log('Injected FIREBASE_CONFIG from environment variables');
})();
`;

fs.writeFileSync(outPath, content, { encoding: 'utf8' });
console.log('Wrote', outPath);
