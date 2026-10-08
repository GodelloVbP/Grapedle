// Release gate: node scripts/release-check.mjs [--freeze]
//   - dist/ is exactly what src/ + data/ build to
//   - the tests pass
//   - HEAD tagged vX.Y.Z => package.json version is X.Y.Z; the README embed URL names the same version
//   --freeze copies data/schedule.json to data/schedule.released.json (step of the release process).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, copyFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
process.chdir(root);

if (process.argv.includes('--freeze')) {
  copyFileSync('data/schedule.json', 'data/schedule.released.json');
  console.log('data/schedule.json -> data/schedule.released.json');
  process.exit(0);
}

const problems = [];
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// 1. dist is up to date
const tmp = mkdtempSync(join(tmpdir(), 'gd-release-'));
try {
  const b = spawnSync(process.execPath, ['scripts/build.mjs'], { env: { ...process.env, GD_OUT: tmp }, encoding: 'utf8' });
  if (b.status !== 0) problems.push('build failed:\n' + b.stderr + b.stdout);
  else for (const f of ['grapedle.min.js', 'grapedle.min.css']) {
    if (!existsSync(join('dist', f))) problems.push(`dist/${f} is missing: run npm run build`);
    else if (!readFileSync(join(tmp, f)).equals(readFileSync(join('dist', f)))) problems.push(`dist/${f} is out of date with src/ and data/: run npm run build`);
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }

// 2. tests
const t = spawnSync(process.execPath, ['--test', ...readdirSync('tests').filter((f) => f.endsWith('.test.js')).map((f) => `tests/${f}`)], { encoding: 'utf8' });
if (t.status !== 0) problems.push('tests failed:\n' + (t.stdout || '').split('\n').filter((l) => /^not ok|^# (pass|fail)/.test(l)).join('\n'));

// 3. version vs tag
const g = spawnSync('git', ['tag', '--points-at', 'HEAD'], { encoding: 'utf8' });
const tags = g.status === 0 ? g.stdout.split('\n').filter((x) => /^v\d/.test(x)) : [];
if (tags.length && !tags.includes('v' + pkg.version)) problems.push(`HEAD is tagged ${tags.join(', ')} but package.json version is ${pkg.version}`);
const readme = readFileSync('README.md', 'utf8');
const urls = [...readme.matchAll(/Grapedle@v([0-9][^/]*)\//g)].map((m) => m[1]);
if (!urls.length || urls.some((v) => v !== pkg.version)) problems.push(`README embed URL version(s) [${urls.join(', ')}] differ from package.json ${pkg.version}`);

if (problems.length) { console.error('release:check FAILED\n- ' + problems.join('\n- ')); process.exit(1); }
console.log(`release:check ok (version ${pkg.version}${tags.length ? ', HEAD tagged ' + tags.join(', ') : ', HEAD not tagged'})`);
