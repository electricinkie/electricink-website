const fs = require('fs');
const path = require('path');

const root = process.cwd();

function getHtmlFiles(dir) {
  return fs.readdirSync(dir).filter(f => f.endsWith('.html'));
}

function extractScriptSrcs(html) {
  const re = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const matches = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

// Scripts that are known to reference window.toast
const toastConsumers = [
  '/js/global-cart.js',
  '/js/cart.js',
  '/js/success.js',
  '/js/auth.js',
  '/js/index-init.js',
  '/js/product-page.js',
  '/js/checkout.js',
  '/js/modal.js'
];

const htmlFiles = getHtmlFiles(root);
let issues = [];

htmlFiles.forEach(file => {
  try {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    const scripts = extractScriptSrcs(content).map(s => s.trim());
    // Consider toast.js OR toast-shim.js as providing safe toast availability
    const toastIndex = scripts.findIndex(s => s.endsWith('/js/toast.js') || s === '/js/toast.js' || s.endsWith('js/toast.js') || s.endsWith('/js/toast-shim.js') || s === '/js/toast-shim.js' || s.endsWith('js/toast-shim.js'));
    // Find any consumer scripts present in this HTML
    const presentConsumers = toastConsumers.filter(c => scripts.find(s => s.endsWith(c) || s === c));
    if (presentConsumers.length === 0) return; // nothing to check here

    presentConsumers.forEach(consumer => {
      const consumerIndex = scripts.findIndex(s => s.endsWith(consumer) || s === consumer);
      if (toastIndex === -1) {
        issues.push({ file, problem: `Missing /js/toast.js but includes ${consumer}` });
      } else if (consumerIndex !== -1 && consumerIndex < toastIndex) {
        issues.push({ file, problem: `${consumer} appears before /js/toast.js (order may break calls)` });
      }
    });
  } catch (e) {
    issues.push({ file, problem: `Failed to read: ${e.message}` });
  }
});

if (issues.length === 0) {
  console.log('OK: No ordering issues found for toast consumers in HTML files.');
  process.exit(0);
}

console.log('Found potential issues:');
issues.forEach(i => console.log('-', i.file, ':', i.problem));
process.exit(2);
