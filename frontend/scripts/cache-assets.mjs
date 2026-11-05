import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve('dist');
const assets = readdirSync(path.join(root, 'assets')).map(name => `/assets/${name}`);
const worker = path.join(root, 'sw.js');
writeFileSync(worker, `self.__FIELDDESK_ASSETS = ${JSON.stringify(assets)};\n${readFileSync(worker, 'utf8')}`);
console.log(`PWA: ${assets.length} recursos preparados para la primera visita sin conexión.`);
