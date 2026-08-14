// Одноразовый скрипт: разворачивает старое дерево сценария из flows.js
// (написанное через фабрику requestForm) в статический flows.json —
// единственный источник правды после перехода на редактирование через /admin.
//
// Запуск: node scripts/export-flows.js
const fs = require('fs');
const path = require('path');

const flows = require('../src/flows');
const outPath = path.join(__dirname, '..', 'src', 'flows.json');

fs.writeFileSync(outPath, JSON.stringify(flows, null, 2) + '\n');
console.log(`Экспортировано ${Object.keys(flows).length} узлов в ${outPath}`);
