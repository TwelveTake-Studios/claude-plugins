import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const made = [];
after(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
}
const script = path.join(here, '..', 'plugins', 'ratchet', 'skills', 'check-sources', 'scripts', 'check-sources.mjs');

function docs(files) {
  const dir = tempDir('check-sources-');
  for (const [name, body] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  return dir;
}

function run(dir, ...args) {
  return runWith({}, dir, ...args);
}

function runWith(env, dir, ...args) {
  const r = spawnSync(process.execPath, [script, '--root', dir, ...args], { encoding: 'utf8', env: { ...process.env, CI: '', ...env } });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('an unsourced figure fails and names the line', () => {
  const dir = docs({ 'plan.md': '# Plan\n\nThe hosted tier costs $40 a month.\n' });
  const r = run(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL plan\.md: 1 unsourced figures, baseline 0/);
  assert.match(r.out, /3: The hosted tier costs \$40 a month\./);
});

test('every kind of figure is caught', () => {
  const dir = docs({
    'a.md': 'Costs \u20AC30.\n\nGrew 12% last year.\n\nIt has 12,000 users.\n\nRequires 2.4.1 or later.\n',
  });
  assert.match(run(dir).out, /a\.md: 4 unsourced figures/);
});

test('a marker word, URL or date in the paragraph passes', () => {
  const dir = docs({
    'a.md': [
      'The hosted tier costs $40 a month.',
      'Price verified on the vendor page.',
      '',
      'Adoption grew 12% (estimate).',
      '',
      'Version 2.4.1 is current, per https://example.com/releases.',
      '',
      'It had 12,000 installs on 2026-10-01.',
      '',
    ].join('\n'),
  });
  assert.equal(run(dir).code, 0);
});

test('tables, headings, code, quotes, checklists and bare integers are skipped', () => {
  const dir = docs({
    'a.md': [
      '| Plan | $40 |',
      '|---|---|',
      '',
      '## Version 2.4.1',
      '',
      '```',
      'npm i example@1.2.3',
      '```',
      '',
      '> Up 30% on the quarter.',
      '',
      '- [ ] Raise the price to $50',
      '',
      'The 5000 series is the base model.',
      '',
    ].join('\n'),
  });
  assert.equal(run(dir).code, 0);
});

test('the baseline allows existing figures and fails on new ones', () => {
  const dir = docs({ 'a.md': 'It costs $40.\n' });
  assert.equal(run(dir).code, 1);
  assert.equal(run(dir, '--write-baseline').code, 0);
  assert.equal(run(dir).code, 0);
  fs.appendFileSync(path.join(dir, 'a.md'), '\nAnd it grew 20%.\n');
  assert.match(run(dir).out, /a\.md: 2 unsourced figures, baseline 1/);
});

test('a missing or empty root fails loudly instead of passing', () => {
  const missing = path.join(os.tmpdir(), `check-sources-missing-${process.pid}-${Date.now()}`);
  assert.equal(run(missing).code, 2);
  const r = spawnSync(process.execPath, [script, '--root'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  const dir = docs({ 'a.md': 'Plain text.\n' });
  const file = run(path.join(dir, 'a.md'));
  assert.equal(file.code, 2);
  assert.match(file.out, /root is not a directory/);
});

test('a bare domain with a path counts as a source, a file name does not', () => {
  const sourced = docs({ 'a.md': 'The official extension is $179/year (woocommerce.com/products/pre-orders).\n' });
  assert.equal(run(sourced).code, 0);
  const unsourced = docs({ 'a.md': 'The plan in naming.md puts it at $49 a year.\n' });
  assert.equal(run(unsourced).code, 1);
});

test('inline code is not read as a figure', () => {
  const dir = docs({ 'a.md': 'List the first column with `awk {print $1}` and the second with `cut -f2`.\n' });
  assert.equal(run(dir).code, 0);
});

test('a bullet that starts with a link is still checked', () => {
  const dir = docs({ 'a.md': '- [Hosted tier](pricing.md) costs $40 a month.\n- [x] Raised the price by 12%\n' });
  assert.match(run(dir).out, /a\.md: 1 unsourced figures/);
});

test('the baseline goes down when a file improves', () => {
  const dir = docs({ 'a.md': 'It costs $40.\n\nIt grew 20%.\n' });
  assert.equal(run(dir, '--write-baseline').code, 0);
  fs.writeFileSync(path.join(dir, 'a.md'), 'It costs $40.\n');
  const lowered = run(dir);
  assert.equal(lowered.code, 0);
  assert.match(lowered.out, /baseline lowered for 1 file/);
  fs.appendFileSync(path.join(dir, 'a.md'), '\nIt grew 30%.\n');
  assert.equal(run(dir).code, 1);
});

test('in CI a baseline that should go down fails instead of being rewritten', () => {
  const dir = docs({ 'a.md': 'It costs $40.\n\nIt grew 20%.\n' });
  assert.equal(run(dir, '--write-baseline').code, 0);
  fs.writeFileSync(path.join(dir, 'a.md'), 'It costs $40.\n');
  const r = runWith({ CI: 'true' }, dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /baseline is stale for 1 file/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '.source-baseline.json'), 'utf8')), { 'a.md': 2 });
});
