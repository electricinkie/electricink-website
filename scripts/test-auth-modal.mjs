import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'url';
import path from 'path';

async function run() {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'dangerously', resources: 'usable' });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  // Minimal stub (not used unless initFirebase is called)
  window.FIREBASE_CONFIG = {};
  // small polyfills for DOM APIs used by modal system
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  // ensure globals are available (modules may reference requestAnimationFrame directly)
  globalThis.requestAnimationFrame = window.requestAnimationFrame;
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame;

  const cwd = process.cwd();
  const authPath = path.join(cwd, 'js', 'auth.js');
  const modalPath = path.join(cwd, 'js', 'modal.js');

  // import modal system first, then auth module
  await import('file://' + modalPath);
  const auth = await import('file://' + authPath);

  // create modal and allow microtasks to run
  auth.createAuthModal();

  // small assertions
  const modalEl = document.getElementById('authModal');
  if (!modalEl) {
    console.error('FAIL: authModal not created');
    process.exit(2);
  }

  const closeBtn = modalEl.querySelector('#closeAuthModal');
  if (!closeBtn || !closeBtn.getAttribute('aria-label')) {
    console.error('FAIL: close button missing or inaccessible');
    process.exit(3);
  }

  const signupBtn = modalEl.querySelector('#signupForm button[type=submit]');
  if (!signupBtn || signupBtn.textContent.trim() !== 'Create my account') {
    console.error('FAIL: signup CTA text incorrect:', signupBtn ? signupBtn.textContent : '(missing)');
    process.exit(4);
  }

  console.log('PASS: auth modal created; close button accessible; signup CTA correct');
  process.exit(0);
}

run().catch((err) => {
  console.error('ERROR running test:', err.stack || err);
  process.exit(1);
});
