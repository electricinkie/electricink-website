#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const version = Date.now();
const filesToUpdate = [
  'admin/dashboard.html',
  'profile.html'
];

console.log(`[Version] Adding ?v=${version} to JS/CSS imports...`);

filesToUpdate.forEach(file => {
  const filepath = path.join(process.cwd(), file);
  if (!fs.existsSync(filepath)) {
    console.log(`[Version] Skip: ${file} not found`);
    return;
  }
  
  let content = fs.readFileSync(filepath, 'utf8');
  
  // Adicionar versão aos scripts que NÃO têm versão
  content = content.replace(
    /<script\s+src="([^"]+\.js)(?!\?v=)"/g,
    `<script src="$1?v=${version}"`
  );
  
  // Adicionar versão aos CSS que NÃO têm versão
  content = content.replace(
    /<link\s+rel="stylesheet"\s+href="([^"]+\.css)(?!\?v=)"/g,
    `<link rel="stylesheet" href="$1?v=${version}"`
  );
  
  fs.writeFileSync(filepath, content, 'utf8');
  console.log(`[Version] ✅ Updated: ${file}`);
});

console.log('[Version] Done!');
