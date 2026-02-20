const fs = require('fs');
const path = require('path');
const affected = JSON.parse(fs.readFileSync('/tmp/affected_products.json','utf8'));
const grouped = affected.reduce((acc, it) => {
  acc[it.file] = acc[it.file] || [];
  acc[it.file].push(it.id);
  return acc;
}, {});

Object.keys(grouped).forEach(file => {
  const fp = path.join('data', file);
  const json = JSON.parse(fs.readFileSync(fp,'utf8'));
  let changed = false;
  grouped[file].forEach(id => {
    if (json[id] && json[id].orderOnRequest !== true) {
      json[id].orderOnRequest = true;
      changed = true;
      console.log('Set orderOnRequest on', file, id);
    }
  });
  if (changed) fs.writeFileSync(fp, JSON.stringify(json, null, 2)+'\n');
});
console.log('Done');
