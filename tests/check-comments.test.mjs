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
const script = path.join(here, '..', 'plugins', 'ratchet', 'skills', 'check-comments', 'scripts', 'check-comments.mjs');

function repo(files) {
  const dir = tempDir('check-comments-');
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

test('section labels, dividers, directives and strings pass', () => {
  const dir = repo({
    'a.js': [
      '// Header',
      'const a = 1;',
      '// ------',
      '// eslint-disable-next-line no-console',
      'console.log(a);',
      'const u = "http://example.com";',
      '',
    ].join('\n'),
    'b.html': '<!-- Footer -->\n<footer></footer>\n<!--[if IE]><p>old</p><![endif]-->\n',
  });
  assert.equal(run(dir).code, 0);
});

test('a descriptive comment fails and names the file and line', () => {
  const dir = repo({ 'src/a.js': 'const a = 1;\n// keep this at one because the old parser breaks on two\nexport default a;\n' });
  const r = run(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /src\/a\.js: 1 \(allowed 0\)/);
  assert.match(r.out, /L2: keep this at one/);
});

test('a short status comment fails', () => {
  const dir = repo({ 'a.ts': '// TODO: fix\nexport const x = 1;\n' });
  assert.equal(run(dir).code, 1);
});

test('html and css comments are checked', () => {
  const dir = repo({
    'a.html': '<!-- removed the banner until the client sends a logo -->\n<p>x</p>\n',
    'a.css': '/* Layout */\n.a {}\n/* this override exists because one browser rounds widths */\n.b {}\n',
  });
  const r = run(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /a\.html: 1/);
  assert.match(r.out, /a\.css: 1/);
});

test('python is checked only when requested', () => {
  const dir = repo({ 'a.py': '#!/usr/bin/env python3\n# retry three times because the API drops the first call\nx = 1\n' });
  assert.equal(run(dir).code, 0);
  assert.equal(run(dir, '--ext', '.py').code, 1);
});

test('the baseline allows existing comments and fails on new ones', () => {
  const dir = repo({ 'a.js': '// this explains something at length\nconst a = 1;\n' });
  assert.equal(run(dir).code, 1);
  assert.equal(run(dir, '--write-baseline').code, 0);
  assert.equal(run(dir).code, 0);
  fs.appendFileSync(path.join(dir, 'a.js'), '// and here is another explanation of it\n');
  const r = run(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /a\.js: 2 \(allowed 1\)/);
});

test('skipped directories are not scanned', () => {
  const dir = repo({
    'node_modules/x/a.js': '// a long explanation inside a dependency\n',
    'dist/a.js': '// generated output that explains itself\n',
    'venv/lib/a.py': '# a long explanation inside a virtualenv\n',
  });
  assert.equal(run(dir).code, 0);
  assert.equal(run(dir, '--ext', '.py').code, 0);
});

test('a missing or empty root fails loudly instead of passing', () => {
  const missing = path.join(os.tmpdir(), `check-comments-missing-${process.pid}-${Date.now()}`);
  assert.equal(run(missing).code, 2);
  const r = spawnSync(process.execPath, [script, '--root'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  const dir = repo({ 'a.js': 'export const x = 1;\n' });
  const file = run(path.join(dir, 'a.js'));
  assert.equal(file.code, 2);
  assert.match(file.out, /root is not a directory/);
});

test('C# and other C-style languages are checked when requested', () => {
  const ok = repo({ 'Player.cs': '#region Movement\n// Movement\npublic class Player { string s = "a // b"; }\n#endregion\n' });
  assert.equal(run(ok, '--ext', '.cs').code, 0);
  const bad = repo({ 'Player.cs': '// clamp speed because the old controller overshoots on slopes\npublic class Player {}\n' });
  const r = run(bad, '--ext', '.cs,.shader,.java');
  assert.equal(r.code, 1);
  assert.match(r.out, /Player\.cs: 1/);
  const shader = repo({ 'Water.shader': 'Shader "Water" {\n  /* tweak the foam later once art signs off */\n}\n' });
  assert.equal(run(shader, '--ext', '.shader').code, 1);
});

test('PHP comments are checked, attributes and template colors are not comments', () => {
  const ok = repo({
    'a.php': "<?php\n#[Route('/admin/settings', methods: ['GET', 'POST'])]\nclass A {}\n// Header\n?>\n<style>a { color: #fff; }</style>\n<a href=\"#top\">top</a>\n",
  });
  const r0 = run(ok, '--ext', '.php');
  assert.equal(r0.code, 0, r0.out);
  for (const body of ['<?php\n// load this late because the theme filters run first\n', '<?php\n# temporary until the client confirms the prices\n', '<?php ?>\n<!-- staging server is 10.0.0.5 -->\n<p>x</p>\n']) {
    const dir = repo({ 'a.php': body });
    assert.equal(run(dir, '--ext', '.php').code, 1, body);
  }
});

test('hash-comment languages are checked, and a hash inside a value is not a comment', () => {
  const ok = repo({
    'deploy.sh': '#!/usr/bin/env bash\n# Setup\necho "${#ARGS[@]}"\nurl="http://example.com/page#top"\n',
    'a.yml': 'name: site\nhomepage: http://example.com/#about\n# Build\n',
  });
  const r0 = run(ok, '--ext', '.sh,.yml');
  assert.equal(r0.code, 0, r0.out);
  const bad = repo({ 'a.yml': 'retries: 3 # three because the API drops the first call\n', 'b.ps1': '<# this script assumes the share is mounted #>\nWrite-Output hi\n' });
  const r = run(bad, '--ext', '.yml,.ps1');
  assert.equal(r.code, 1);
  assert.match(r.out, /a\.yml: 1/);
  assert.match(r.out, /b\.ps1: 1/);
});

test('an unsupported extension is rejected', () => {
  const dir = repo({ 'a.cbl': '* creds live in the vault\n' });
  const r = run(dir, '--ext', '.cbl');
  assert.equal(r.code, 2);
  assert.match(r.out, /unsupported extension \.cbl/);
});

test('status words fail with or without a colon', () => {
  for (const comment of ['// TODO fix later', '// FIXME broken here', '// TODO(dave): remove', '// HACK']) {
    const dir = repo({ 'a.js': `${comment}\nexport const x = 1;\n` });
    assert.equal(run(dir).code, 1, comment);
  }
});

test('labels carrying notes or punctuation fail', () => {
  for (const comment of ['// unverified, do not render', '// remove before launch', '// Jane Roe, CFO', '// password is in the vault', '// Step 1: setup.']) {
    const dir = repo({ 'a.js': `${comment}\nexport const x = 1;\n` });
    assert.equal(run(dir).code, 1, comment);
  }
  const dir = repo({ 'a.html': '<!-- Jane Roe, CFO -->\n<p>x</p>\n' });
  assert.equal(run(dir).code, 1);
});

test('real section labels pass, including colons and box-drawing dividers', () => {
  const box = String.fromCharCode(0x2500);
  const labels = [
    '// Step 3: Date',
    '/* Layer 1: role tokens */',
    '// TL;DR',
    '// Delete Modal',
    '// iCal feed token',
    `// ${box.repeat(2)} Helpers ${box.repeat(60)}`,
    `// ${box.repeat(70)}`,
  ];
  const dir = repo({
    'a.ts': labels.map((l) => `${l}\nexport const x${labels.indexOf(l)} = 1;`).join('\n') + '\n',
    'b.html': '<!-- CARD: THIS WEEK -->\n<div></div>\n<!-- ---- Tokens: LIGHT ---------------------------------------- -->\n',
  });
  const r = run(dir);
  assert.equal(r.code, 0, r.out);
});

test('prose that starts like a directive is still checked', () => {
  const dir = repo({ 'a.js': '// global state is shared because the worker reuses the module\nexport const x = 1;\n' });
  assert.equal(run(dir).code, 1);
});

test('real directives pass, and text after them is still judged', () => {
  const ok = repo({
    'a.js': [
      '/* global window, document */',
      '// eslint-disable-next-line no-console',
      'console.log(window, document);',
      '/** @type {Map<string, number>} */',
      'const cache = new Map();',
      '',
    ].join('\n'),
  });
  assert.equal(run(ok).code, 0);
  const reason = repo({ 'a.js': '// eslint-disable-next-line no-console -- the logger is not loaded yet\nconsole.log(1);\n' });
  assert.equal(run(reason).code, 1);
  const jsdoc = repo({ 'a.js': '/**\n * Caches results because lookups are slow\n * @type {Map}\n */\nconst cache = new Map();\n' });
  assert.equal(run(jsdoc).code, 1);
});

test('html comments in vue and svelte files are checked', () => {
  const vue = repo({ 'a.vue': '<template>\n<!-- server is 10.0.0.5 and the login is shared -->\n<p>x</p>\n</template>\n<script>\n// Setup\nexport default {};\n</script>\n' });
  const r = run(vue);
  assert.equal(r.code, 1);
  assert.match(r.out, /L2: server is 10\.0\.0\.5/);
  const svelte = repo({ 'a.svelte': '<script>\n// this component is temporary until the redesign\nlet x = 1;\n</script>\n<p>{x}</p>\n' });
  assert.equal(run(svelte).code, 1);
});

test('markdown comments are checked outside code fences', () => {
  const dir = repo({ 'a.md': '# Title\n\n<!-- the client has not sent the logo yet -->\n\n```html\n<!-- an example comment -->\n```\n' });
  const r = run(dir, '--ext', '.md');
  assert.equal(r.code, 1);
  assert.match(r.out, /a\.md: 1 \(allowed 0\)/);
});

test('an apostrophe in JSX text does not swallow the next lines', () => {
  const dir = repo({ 'a.jsx': "const A = () => <p>Don't panic</p>;\nconst u = 'http://example.com';\n// this explains the retry logic in detail\nexport { A, u };\n" });
  const r = run(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /a\.jsx: 1 \(allowed 0\)/);
  assert.match(r.out, /L3: this explains the retry logic/);
});

test('the baseline goes down when a file improves', () => {
  const dir = repo({ 'a.js': '// first explanation of why the value is one\n// second explanation of why the value is one\nconst a = 1;\n' });
  assert.equal(run(dir, '--write-baseline').code, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '.comment-baseline.json'), 'utf8')), { 'a.js': 2 });
  fs.writeFileSync(path.join(dir, 'a.js'), 'const a = 1;\n');
  const lowered = run(dir);
  assert.equal(lowered.code, 0);
  assert.match(lowered.out, /baseline lowered for 1 file/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '.comment-baseline.json'), 'utf8')), {});
  fs.writeFileSync(path.join(dir, 'a.js'), '// a new explanation of something\nconst a = 1;\n');
  assert.equal(run(dir).code, 1);
});

test('baseline entries for file types not scanned this run are kept', () => {
  const dir = repo({ 'a.py': '# an explanation of the retry logic\nx = 1\n' });
  assert.equal(run(dir, '--ext', '.py', '--write-baseline').code, 0);
  assert.equal(run(dir).code, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '.comment-baseline.json'), 'utf8')), { 'a.py': 1 });
});

test('in CI a baseline that should go down fails instead of being rewritten', () => {
  const dir = repo({ 'a.js': '// first explanation of why the value is one\n// second explanation of why the value is one\nconst a = 1;\n' });
  assert.equal(run(dir, '--write-baseline').code, 0);
  fs.writeFileSync(path.join(dir, 'a.js'), 'const a = 1;\n');
  for (const [env, args] of [[{ CI: 'true' }, []], [{}, ['--ci']]]) {
    const r = runWith(env, dir, ...args);
    assert.equal(r.code, 1);
    assert.match(r.out, /baseline is stale for 1 file/);
    assert.match(r.out, /a\.js: 2 -> 0/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '.comment-baseline.json'), 'utf8')), { 'a.js': 2 });
  }
});

test('a baseline that cannot be written is reported instead of crashing', (t) => {
  const dir = repo({ 'a.js': '// first explanation of why the value is one\nconst a = 1;\n' });
  assert.equal(run(dir, '--write-baseline').code, 0);
  const baseline = path.join(dir, '.comment-baseline.json');
  fs.chmodSync(baseline, 0o444);
  let writable = true;
  try {
    fs.appendFileSync(baseline, '');
  } catch {
    writable = false;
  }
  if (writable) {
    fs.chmodSync(baseline, 0o644);
    t.skip('cannot make a file read-only here');
    return;
  }
  fs.writeFileSync(path.join(dir, 'a.js'), 'const a = 1;\n');
  const r = run(dir);
  fs.chmodSync(baseline, 0o644);
  assert.equal(r.code, 0);
  assert.match(r.out, /could not write the lowered baseline/);
  assert.match(r.out, /a\.js: 1 -> 0/);
});

test('labels that carry values or secrets fail', () => {
  for (const comment of ['// staging: 10.0.0.5', '// secret: hunter2', '// token: abc123', '// remove later', '// temporary hack', '// a = b', '// ask jane@example.com', '// API key: in vault']) {
    const dir = repo({ 'a.js': `${comment}\nexport const x = 1;\n` });
    assert.equal(run(dir).code, 1, comment);
  }
});

test('text after a directive token is judged, and real directives pass', () => {
  const failing = [
    '// @ts-expect-error upstream types are wrong until v5 ships',
    '// eslint-disable-next-line no-console because the logger is not loaded yet',
    '// prettier-ignore because the table lines up by hand',
    '/** @type {number} retry count agreed with the client in the contract */',
    '// eslint config: the rule is off because of the old parser',
  ];
  for (const comment of failing) {
    const dir = repo({ 'a.ts': `${comment}\nexport const x = 1;\n` });
    assert.equal(run(dir).code, 1, comment);
  }
  const passing = [
    '// @ts-expect-error',
    '/* eslint no-console: off */',
    '/* eslint-env node, browser */',
    '// biome-ignore lint/style/useConst: the loop reassigns it',
    '/* webpackChunkName: "editor", webpackPrefetch: true */',
    '/**\n * @license\n * Copyright (c) 2026 Example Ltd. Released under the MIT license, see LICENSE for the full text.\n */',
    '// c8 ignore next',
  ];
  const sql = repo({ 'dump.sql': "/*!40103 SET TIME_ZONE='+00:00' */;\n/*M!100100 SET NAMES utf8mb4 */;\nSELECT 1;\n" });
  assert.equal(run(sql).code, 0);
  const generated = repo({ 'test-output/report/index.html': '<!-- generated report, do not edit -->\n', 'playwright-report/index.html': '<!-- generated report, do not edit -->\n' });
  assert.equal(run(generated).code, 0);
  for (const comment of passing) {
    const dir = repo({ 'a.ts': `${comment}\nexport const x = 1;\n` });
    const r = run(dir);
    assert.equal(r.code, 0, `${comment}\n${r.out}`);
  }
});

test('a license marker does not exempt the notes around it', () => {
  const failing = [
    '/**\n * Pricing negotiated with ACME at 40 per seat, keep this private until the contract is signed.\n * @preserve\n */',
    '/*\n * Server is the old box, the admin login is still the default one.\n * @license MIT\n */',
  ];
  for (const comment of failing) {
    const dir = repo({ 'a.js': `${comment}\nexport const x = 1;\n` });
    assert.equal(run(dir).code, 1, comment);
  }
  const mit = repo({
    'a.js': '/**\n * @license MIT\n * Copyright (c) 2026 Example Ltd.\n * Permission is hereby granted, free of charge, to any person obtaining a copy of this software.\n */\nexport const x = 1;\n',
    'b.js': '/*! @license MIT */\n/* SPDX-License-Identifier: Apache-2.0 */\nexport const y = 1;\n',
  });
  const r = run(mit);
  assert.equal(r.code, 0, r.out);
});

test('URLs are not read as comments', () => {
  const dir = repo({
    'a.scss': '.hero { background: url(http://cdn.example.com/images/hero-background-large.png); }\n// Layout\n',
    'a.jsx': 'export const A = () => <a href="/docs">Visit http://example.com/docs/getting-started/a-long-path</a>;\n',
  });
  const r = run(dir, '--ext', '.scss');
  assert.equal(r.code, 0, r.out);
});

test('line comments in scss style blocks of vue files are checked', () => {
  const dir = repo({ 'a.vue': '<template><p>x</p></template>\n<style lang="scss">\n// pricing banner hidden until the client signs off\n.a { color: red; }\n</style>\n' });
  const r = run(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /L3: pricing banner hidden/);
});
