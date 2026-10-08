import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const common = { bundle: true, minify: true, legalComments: 'none', logLevel: 'warning' };
await build({ ...common, entryPoints: ['src/index.js'], outfile: 'dist/grapedle.min.js', format: 'iife', target: ['es2019'], loader: { '.json': 'json' } });
await build({ ...common, entryPoints: ['src/style.css'], outfile: 'dist/grapedle.min.css', target: ['chrome80', 'safari13', 'firefox78'] });
const gz = (f) => gzipSync(readFileSync(f)).length;
const js = gz('dist/grapedle.min.js'), css = gz('dist/grapedle.min.css');
console.log(`gzip: js ${(js / 1024).toFixed(1)} KB, css ${(css / 1024).toFixed(1)} KB, total ${((js + css) / 1024).toFixed(1)} KB (limit 80)`);
if (js + css > 80 * 1024) { console.error('Bundle too large'); process.exit(1); }
