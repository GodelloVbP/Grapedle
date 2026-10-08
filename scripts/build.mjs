import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

// grapes.json carries a `sources` object per record for the maintainers; the game does not need it.
const stripSources = {
  name: 'strip-sources',
  setup(b) {
    b.onLoad({ filter: /data[\\/]grapes\.json$/ }, (args) => {
      const list = JSON.parse(readFileSync(args.path, 'utf8'));
      for (const g of list) delete g.sources;
      return { contents: JSON.stringify(list), loader: 'json' };
    });
  },
};
// GD_OUT: build the production files somewhere else (release:check compares them with dist/).
const OUT = process.env.GD_OUT || 'dist';
const PROD = OUT === 'dist';
const common = { bundle: true, minify: true, legalComments: 'none', logLevel: 'warning' };
const js = { ...common, entryPoints: ['src/index.js'], format: 'iife', target: ['es2019'], loader: { '.json': 'json' }, plugins: [stripSources] };
// Production: __GD_DEV__ is false, so the shop fixture (?mockShop=) is dropped from the bundle.
await build({ ...js, outfile: `${OUT}/grapedle.min.js`, define: { __GD_DEV__: 'false' } });
// Preview page only (dev/index.html): keeps the fixture. Not served to customers.
if (PROD) await build({ ...js, outfile: 'dev/grapedle.dev.js', define: { __GD_DEV__: 'true' } });
await build({ ...common, entryPoints: ['src/style.css'], outfile: `${OUT}/grapedle.min.css`, target: ['chrome80', 'safari13', 'firefox78'] });
const gz = (f) => gzipSync(readFileSync(f)).length;
const size = (f) => readFileSync(f).length;
const j = gz(`${OUT}/grapedle.min.js`), c = gz(`${OUT}/grapedle.min.css`);
console.log(`raw: js ${size(`${OUT}/grapedle.min.js`)} B, css ${size(`${OUT}/grapedle.min.css`)} B`);
console.log(`gzip: js ${(j / 1024).toFixed(1)} KB, css ${(c / 1024).toFixed(1)} KB, total ${((j + c) / 1024).toFixed(1)} KB (limit 80)`);
if (readFileSync(`${OUT}/grapedle.min.js`, 'utf8').includes('Mock Rood')) { console.error('Shop fixture leaked into the production bundle'); process.exit(1); }
if (j + c > 80 * 1024) { console.error('Bundle too large'); process.exit(1); }
