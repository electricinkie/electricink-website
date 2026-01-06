const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'images', 'home', 'new-arrivals');
const oldName = '0.25 - RS.webp';
const newName = '0.25-RS.webp';

const oldPath = path.join(dir, oldName);
const newPath = path.join(dir, newName);

if (!fs.existsSync(oldPath)) {
  console.log('Source image not found:', oldPath);
  process.exit(0);
}

try {
  fs.renameSync(oldPath, newPath);
  console.log('Renamed:', oldName, '->', newName);
} catch (err) {
  console.error('Failed to rename image:', err);
  process.exit(1);
}
