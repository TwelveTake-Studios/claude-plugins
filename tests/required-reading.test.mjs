import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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
const gate = path.join(here, '..', 'plugins', 'required-reading', 'hooks', 'gate.mjs');
const RUNBOOK = Array.from({ length: 10 }, (_, i) => `step ${i + 1}`).join('\n') + '\n';

const RULES = {
  rules: [
    { name: 'deploys', match: '\\bdeploy|\\brsync\\b', read: ['docs/RUNBOOK.md'], note: 'Compare the server first.' },
  ],
};

function setup({ config = RULES, homeConfig, files = { 'docs/RUNBOOK.md': RUNBOOK }, homeFiles = {} } = {}) {
  const root = tempDir('rr-project-');
  const home = tempDir('rr-home-');
  const write = (base, name, body) => {
    const file = path.join(base, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  };
  if (config !== null) write(root, '.claude/required-reading.json', typeof config === 'string' ? config : JSON.stringify(config));
  if (homeConfig) write(home, '.claude/required-reading.json', JSON.stringify(homeConfig));
  for (const [name, body] of Object.entries(files)) write(root, name, body);
  for (const [name, body] of Object.entries(homeFiles)) write(home, name, body);
  const data = tempDir('rr-data-');
  return { root, home, data, session: `test-${crypto.randomUUID()}`, path: (name) => path.join(root, name) };
}

function hook(p, payload) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: p.root, HOME: p.home, USERPROFILE: p.home, CLAUDE_PLUGIN_DATA: p.data };
  const r = spawnSync(process.execPath, [gate], {
    input: JSON.stringify({ session_id: p.session, cwd: p.root, ...payload }),
    env,
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(r.status, 0, r.error ? String(r.error) : r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
}

const pre = (p, tool, input, extra = {}) => hook(p, { hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, ...extra });
const bash = (p, command, extra = {}) => pre(p, 'Bash', { command }, extra);

function read(p, file, startLine, numLines, extra = {}) {
  return hook(p, {
    hook_event_name: 'PostToolUse',
    tool_name: 'Read',
    tool_input: { file_path: file },
    tool_response: { type: 'text', file: { filePath: file, content: '', startLine, numLines, totalLines: 11 } },
    ...extra,
  });
}

function unchanged(p, file, extra = {}) {
  return hook(p, {
    hook_event_name: 'PostToolUse',
    tool_name: 'Read',
    tool_input: { file_path: file, ...extra },
    tool_response: { type: 'file_unchanged', file: { filePath: file } },
  });
}

const denied = (out) => out && out.permissionDecision === 'deny';

test('does nothing without a config file', () => {
  const p = setup({ config: null });
  assert.equal(bash(p, 'echo deploy'), null);
});

test('ignores calls that match no rule', () => {
  const p = setup();
  assert.equal(bash(p, 'npm test'), null);
});

test('blocks a matching call until the file is read in full', () => {
  const p = setup();
  const runbook = p.path('docs/RUNBOOK.md');

  const first = bash(p, 'npm run deploy');
  assert.ok(denied(first));
  assert.match(first.permissionDecisionReason, /"deploys"/);
  assert.ok(first.permissionDecisionReason.includes(`${runbook} (not read yet)`));

  read(p, runbook, 1, 4);
  const partial = bash(p, 'npm run deploy');
  assert.ok(denied(partial));
  assert.match(partial.permissionDecisionReason, /6 of 10 lines not read yet/);

  read(p, runbook, 5, 7);
  const allowed = bash(p, 'npm run deploy');
  assert.ok(!denied(allowed));
  assert.match(allowed.additionalContext, /Compare the server first\./);

  assert.equal(bash(p, 'npm run deploy'), null);
});

test('a Read that only started does not count', () => {
  const p = setup();
  const runbook = p.path('docs/RUNBOOK.md');
  assert.equal(pre(p, 'Read', { file_path: runbook }), null);
  assert.ok(denied(bash(p, 'rsync -av site/ host:/srv')));
});

test('an unchanged re-read is credited with the range it asked for', () => {
  const p = setup();
  const runbook = p.path('docs/RUNBOOK.md');
  unchanged(p, runbook, { offset: 1, limit: 3 });
  assert.match(bash(p, 'deploy').permissionDecisionReason, /7 of 10 lines/);
  unchanged(p, runbook);
  assert.ok(!denied(bash(p, 'deploy')));
});

test('new lines in a file that grew must be read too', () => {
  const p = setup();
  const runbook = p.path('docs/RUNBOOK.md');
  read(p, runbook, 1, 11);
  assert.ok(!denied(bash(p, 'deploy')));
  fs.appendFileSync(runbook, 'step 11\n');
  assert.match(bash(p, 'deploy').permissionDecisionReason, /1 of 11 lines not read yet/);
});

test('an edited line must be read again and moved lines still count', () => {
  const p = setup();
  const runbook = p.path('docs/RUNBOOK.md');
  read(p, runbook, 1, 11);
  const lines = RUNBOOK.split('\n');
  lines.splice(3, 1, 'step 4, now with a backup first');
  lines.unshift('# Runbook', '');
  fs.writeFileSync(runbook, lines.join('\n'));
  const out = bash(p, 'deploy');
  assert.ok(denied(out));
  assert.match(out.permissionDecisionReason, /2 of 11 lines not read yet: lines 1, 6\)/);
  read(p, runbook, 1, 1);
  read(p, runbook, 6, 1);
  assert.ok(!denied(bash(p, 'deploy')));
});

test('unread lines separated only by blank lines are reported as one span', () => {
  const p = setup({ files: { 'docs/RUNBOOK.md': 'a\n\nb\nc\n\n\nd\n' } });
  const out = bash(p, 'deploy');
  assert.ok(out.permissionDecisionReason.includes('(not read yet)'));
  read(p, p.path('docs/RUNBOOK.md'), 1, 1);
  assert.match(bash(p, 'deploy').permissionDecisionReason, /3 of 4 lines not read yet: lines 3-7\)/);
});

test('always files are required whenever any rule matches', () => {
  const p = setup({
    config: { ...RULES, always: ['docs/KNOWN.md'] },
    files: { 'docs/RUNBOOK.md': RUNBOOK, 'docs/KNOWN.md': 'one\ntwo\n' },
  });
  read(p, p.path('docs/RUNBOOK.md'), 1, 11);
  const out = bash(p, 'deploy');
  assert.ok(denied(out));
  assert.ok(out.permissionDecisionReason.includes(p.path('docs/KNOWN.md')));
  assert.ok(!out.permissionDecisionReason.includes('RUNBOOK'));
  assert.equal(bash(p, 'npm test'), null);
});

test('PowerShell commands, edit content and file paths are checked', () => {
  const p = setup();
  assert.ok(denied(pre(p, 'PowerShell', { command: 'Write-Output deploy' })));
  assert.ok(denied(pre(p, 'Edit', { file_path: p.path('src/a.js'), old_string: 'x', new_string: 'run("rsync")' })));
  assert.ok(denied(pre(p, 'Write', { file_path: p.path('scripts/deploy.sh'), content: 'echo hi' })));
  assert.ok(denied(pre(p, 'NotebookEdit', { notebook_path: p.path('n.ipynb'), new_source: 'deploy()' })));
});

test('word boundaries keep ordinary code from matching', () => {
  const p = setup();
  assert.equal(pre(p, 'Write', { file_path: p.path('a.js'), content: 'fs.readdirSync(dir); redeployed = false;' }), null);
});

test('editing the config file itself is never blocked', () => {
  const p = setup();
  const cfg = p.path('.claude/required-reading.json');
  assert.equal(pre(p, 'Edit', { file_path: cfg, old_string: 'deploy', new_string: 'deploy|rsync' }), null);
});

test('a missing required file is reported as missing', () => {
  const p = setup({ files: {} });
  assert.match(bash(p, 'deploy').permissionDecisionReason, /file not found/);
});

test('invalid JSON is reported once and enforces nothing', () => {
  const p = setup({ config: '{ "rules": [ ' });
  const first = bash(p, 'deploy');
  assert.ok(!denied(first));
  assert.match(first.additionalContext, /is not valid JSON/);
  assert.equal(bash(p, 'deploy'), null);
});

test('an invalid pattern is reported and the other rules still apply', () => {
  const p = setup({
    config: { rules: [{ name: 'broken', match: '(', read: ['docs/RUNBOOK.md'] }, ...RULES.rules] },
  });
  const out = bash(p, 'deploy');
  assert.ok(denied(out));
  assert.match(out.permissionDecisionReason, /"broken" has an invalid pattern/);
});

test('a pattern with a backspace character from a JSON escaping slip is reported', () => {
  const p = setup({ config: { rules: [{ name: 'slipped', match: '\bdeploy\b', read: ['docs/RUNBOOK.md'] }] } });
  const out = bash(p, 'echo deploy');
  assert.ok(!denied(out));
  assert.match(out.additionalContext, /"slipped" contains a backspace character/);
});

test('personal rules in the home directory apply alongside project rules', () => {
  const p = setup({
    homeConfig: { rules: [{ name: 'migrations', match: 'prisma migrate', read: ['notes/migrations.md'] }] },
    homeFiles: { 'notes/migrations.md': 'back up first\n' },
  });
  const out = bash(p, 'npx prisma migrate deploy');
  assert.ok(denied(out));
  assert.ok(out.permissionDecisionReason.includes(path.join(p.home, 'notes/migrations.md')));
  assert.ok(out.permissionDecisionReason.includes(p.path('docs/RUNBOOK.md')));
});

test('sessions do not share read state', () => {
  const p = setup();
  read(p, p.path('docs/RUNBOOK.md'), 1, 11);
  assert.ok(!denied(bash(p, 'deploy')));
  const other = { ...p, session: `test-${crypto.randomUUID()}` };
  assert.ok(denied(bash(other, 'deploy')));
});

test('a long command is checked in full', () => {
  const p = setup();
  const command = `cat > notes.txt <<'X'\n${'x'.repeat(4100)}\nX\nrsync -av site/ host:/srv`;
  assert.ok(denied(bash(p, command)));
});

test('anchored patterns are tested against each field on its own', () => {
  const p = setup({
    config: {
      rules: [
        { name: 'publish', match: 'npm publish$', read: ['docs/RUNBOOK.md'] },
        { name: 'push', match: '^git push$', read: ['docs/RUNBOOK.md'] },
      ],
    },
  });
  assert.ok(denied(bash(p, 'npm publish')));
  assert.ok(denied(bash(p, 'git push')));
  assert.equal(bash(p, 'git push --dry-run'), null);
});

test('rules written with forward slashes match Windows paths', () => {
  const p = setup({ config: { rules: [{ name: 'migrations', match: 'db/migrations/', read: ['docs/RUNBOOK.md'] }] } });
  assert.ok(denied(pre(p, 'Write', { file_path: 'C:\\proj\\db\\migrations\\001.sql', content: 'select 1' })));
});

test('a project config may only name files inside the project', () => {
  const p = setup({
    config: {
      rules: [{ name: 'deploys', match: '\\bdeploy', read: ['docs/RUNBOOK.md', '~/.ssh/id_rsa', '../outside.md'] }],
      always: ['\\\\fileserver\\share\\notes.md'],
    },
  });
  const out = bash(p, 'deploy');
  assert.ok(denied(out));
  const reason = out.permissionDecisionReason;
  assert.ok(reason.includes(`${p.path('docs/RUNBOOK.md')} (not read yet)`));
  assert.ok(!/id_rsa \(/.test(reason));
  assert.match(reason, /names ~\/\.ssh\/id_rsa, which is outside the project/);
  assert.match(reason, /names \.\.\/outside\.md, which is outside the project/);
  assert.match(reason, /network or device path/);
  read(p, p.path('docs/RUNBOOK.md'), 1, 11);
  assert.ok(!denied(bash(p, 'deploy')));
});

test('a pattern that times out is treated as matching', () => {
  const p = setup({ config: { rules: [{ name: 'slow', match: '^(\\w+\\s?)*$', read: ['docs/RUNBOOK.md'] }] } });
  const started = Date.now();
  const out = bash(p, `${'word '.repeat(20)}!`);
  assert.ok(Date.now() - started < 5000);
  assert.ok(denied(out));
  assert.match(out.permissionDecisionReason, /"slow" took longer than 250 ms to match, so it is treated as matching/);
  assert.ok(denied(bash(p, `${'word '.repeat(20)}!`)));
  read(p, p.path('docs/RUNBOOK.md'), 1, 11);
  assert.ok(!denied(bash(p, `${'word '.repeat(20)}!`)));
});

test('many slow patterns share one time budget', () => {
  const rules = Array.from({ length: 20 }, (_, i) => ({ name: `slow${i}`, match: '^(\\w+\\s?)*$', read: ['docs/RUNBOOK.md'] }));
  const p = setup({ config: { rules } });
  const started = Date.now();
  const out = bash(p, `${'word '.repeat(20)}!`);
  assert.ok(Date.now() - started < 8000);
  assert.ok(denied(out));
  assert.match(out.permissionDecisionReason, /used up the 2000 ms budget/);
});

test('project rules may only require documents', () => {
  const p = setup({
    config: { rules: [{ name: 'deploys', match: '\\bdeploy', read: ['docs/RUNBOOK.md'] }], always: ['.env', '.claude/settings.local.json'] },
    files: { 'docs/RUNBOOK.md': RUNBOOK, '.env': 'TOKEN=abc\n', '.claude/settings.local.json': '{}\n' },
  });
  const out = bash(p, 'deploy');
  assert.match(out.permissionDecisionReason, /names \.env; project rules may only require documents/);
  assert.match(out.permissionDecisionReason, /settings\.local\.json; project rules may only require documents/);
  read(p, p.path('docs/RUNBOOK.md'), 1, 11);
  assert.ok(!denied(bash(p, 'deploy')));
});

test('a project folder whose name starts with two dots is inside the project', () => {
  const p = setup({
    config: { rules: [{ name: 'deploys', match: '\\bdeploy', read: ['..data/RUNBOOK.md'] }] },
    files: { '..data/RUNBOOK.md': RUNBOOK },
  });
  const out = bash(p, 'deploy');
  assert.ok(out.permissionDecisionReason.includes(`${p.path('..data/RUNBOOK.md')} (not read yet)`));
  assert.ok(!/outside the project/.test(out.permissionDecisionReason));
});

test('a project path that goes through a symbolic link is rejected, however many hops', (t) => {
  const p = setup({ config: { rules: [{ name: 'deploys', match: '\\bdeploy', read: ['docs/one-hop.md', 'docs/two-hop.md', 'docs/RUNBOOK.md'] }] } });
  try {
    fs.symlinkSync('\\\\fileserver\\share\\notes.md', p.path('docs/target.md'), 'file');
    fs.symlinkSync('\\\\fileserver\\share\\notes.md', p.path('docs/one-hop.md'), 'file');
    fs.symlinkSync(p.path('docs/target.md'), p.path('docs/two-hop.md'), 'file');
  } catch {
    t.skip('cannot create a symbolic link here');
    return;
  }
  const out = bash(p, 'deploy');
  const text = out.permissionDecisionReason;
  assert.match(text, /one-hop\.md, which goes through a symbolic link/);
  assert.match(text, /two-hop\.md, which goes through a symbolic link/);
  assert.ok(text.includes(`${p.path('docs/RUNBOOK.md')} (not read yet)`));
});

test('reads of files no rule names leave no trace', () => {
  const p = setup({ files: { 'docs/RUNBOOK.md': RUNBOOK, 'notes.txt': 'secret=hunter2\n' } });
  read(p, p.path('notes.txt'), 1, 1);
  assert.equal(fs.existsSync(path.join(p.data, 'state')), false);
  read(p, p.path('docs/RUNBOOK.md'), 1, 11);
  assert.equal(fs.existsSync(path.join(p.data, 'state')), true);
});

test('a new project config can be created while personal rules apply', () => {
  const p = setup({ config: null, homeConfig: RULES });
  const file = p.path('.claude/required-reading.json');
  assert.equal(pre(p, 'Write', { file_path: file, content: '{"rules":[{"name":"d","match":"deploy"}]}' }), null);
});

test('subagents keep their own read state', () => {
  const p = setup();
  read(p, p.path('docs/RUNBOOK.md'), 1, 11);
  assert.ok(!denied(bash(p, 'deploy')));
  assert.ok(denied(bash(p, 'deploy', { agent_id: 'sub1' })));
  read(p, p.path('docs/RUNBOOK.md'), 1, 11, { agent_id: 'sub1' });
  assert.ok(!denied(bash(p, 'deploy', { agent_id: 'sub1' })));
});

test('compaction resets read state', () => {
  const p = setup();
  read(p, p.path('docs/RUNBOOK.md'), 1, 11);
  assert.ok(!denied(bash(p, 'deploy')));
  hook(p, { hook_event_name: 'SessionStart', source: 'compact' });
  assert.ok(denied(bash(p, 'deploy')));
});

test('state older than two weeks is pruned at session start', () => {
  const p = setup();
  const old = path.join(p.data, 'state', 'old-session');
  fs.mkdirSync(path.join(old, 'main'), { recursive: true });
  const then = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  fs.utimesSync(old, then, then);
  hook(p, { hook_event_name: 'SessionStart', source: 'startup' });
  assert.equal(fs.existsSync(old), false);
});

test('a read through a linked folder counts for the real file', (t) => {
  const p = setup();
  const link = p.path('linked-docs');
  try {
    fs.symlinkSync(p.path('docs'), link, 'junction');
  } catch {
    t.skip('cannot create a directory link here');
    return;
  }
  read(p, path.join(link, 'RUNBOOK.md'), 1, 11);
  assert.ok(!denied(bash(p, 'deploy')));
});
