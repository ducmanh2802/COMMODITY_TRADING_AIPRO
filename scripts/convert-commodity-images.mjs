// Usage: node scripts/convert-commodity-images.mjs  (needs `sharp`; set SHARP_PATH to its dir if not installed locally)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_PATH || 'sharp');
const dir = 'src/assets/images';
const src = fs.readFileSync('src/shared/data/commodityVisuals.ts', 'utf8');
const used = [...new Set(src.match(/commodity_[a-z]+_[a-z]+_\d+\.jpg/g))];
let before = 0, after = 0;
for (const f of used) {
  const inp = path.join(dir, f), out = inp.replace(/\.jpg$/, '.webp');
  const info = await sharp(inp).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 78 }).toFile(out);
  before += fs.statSync(inp).size; after += info.size;
  console.log(f, info.width + 'x' + info.height);
}
console.log('before', (before/1e6).toFixed(1), 'MB after', (after/1e6).toFixed(1), 'MB');
