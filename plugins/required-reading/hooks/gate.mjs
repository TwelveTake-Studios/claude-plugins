#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';

const CONFIG_NAME = 'required-reading.json';
const DEFAULT_READ_LIMIT = 2000;
const CONTENT_CHARS = 4000;
const MATCH_TIMEOUT_MS = 250;
const MATCH_BUDGET_MS = 2000;
const DOC_EXT = new Set(['.md', '.mdx', '.markdown', '.txt', '.rst', '.adoc']);
const STATE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const FOLD_CASE = process.platform === 'win32' || process.platform === 'darwin';

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function real(p) {
  const abs = path.resolve(String(p || ''));
  const rest = [];
  let dir = abs;
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(dir), ...rest);
    } catch {}
    const parent = path.dirname(dir);
    if (parent === dir) return abs;
    rest.unshift(path.basename(dir));
    dir = parent;
  }
}

function norm(p) {
  const s = real(p).split(path.sep).join('/');
  return FOLD_CASE ? s.toLowerCase() : s;
}

function hash(text) {
  return crypto.createHash('sha1').update(text).digest('hex');
}

function isNetworkPath(p) {
  return /^[\\/]{2}/.test(String(p));
}

function expand(p, base) {
  const s = String(p);
  if (s === '~' || s.startsWith('~/') || s.startsWith('~\\')) return path.join(os.homedir(), s.slice(1));
  return path.isAbsolute(s) ? s : path.resolve(base, s);
}

function toList(value) {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

function safe(part) {
  return String(part || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'none';
}

function stateRoot() {
  const base = process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.claude', 'required-reading');
  return path.join(base, 'state');
}

function sessionDir(session) {
  return path.join(stateRoot(), safe(session));
}

function agentDir(session, agent) {
  return path.join(sessionDir(session), safe(agent || 'main'));
}

function writeAtomic(dir, name, body) {
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const target = path.join(dir, name);
    fs.writeFileSync(`${target}.tmp`, body, { mode: 0o600 });
    fs.renameSync(`${target}.tmp`, target);
  } catch {}
}

function hasFlag(ctx, name) {
  return fs.existsSync(path.join(agentDir(ctx.session, ctx.agent), 'flags', hash(name)));
}

function setFlag(ctx, name) {
  writeAtomic(path.join(agentDir(ctx.session, ctx.agent), 'flags'), hash(name), '');
}

function fileLines(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n');
  } catch {
    return null;
  }
}

function lineKey(line) {
  return hash(line.replace(/\r$/, '')).slice(0, 16);
}

function readsDir(ctx, file) {
  return path.join(agentDir(ctx.session, ctx.agent), 'reads', hash(norm(file)));
}

function recordRange(ctx, file, start, end) {
  if (!file || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return;
  const lines = fileLines(file);
  if (!lines) return;
  const keys = lines.slice(start - 1, end).filter((line) => line.trim()).map(lineKey);
  if (!keys.length) return;
  writeAtomic(readsDir(ctx, file), `${process.pid}-${crypto.randomUUID()}`, keys.join('\n'));
  try {
    const now = new Date();
    fs.utimesSync(sessionDir(ctx.session), now, now);
  } catch {}
}

function readKeys(ctx, file) {
  const keys = new Set();
  const dir = readsDir(ctx, file);
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return keys;
  }
  for (const name of names) {
    if (name.endsWith('.tmp')) continue;
    try {
      for (const key of fs.readFileSync(path.join(dir, name), 'utf8').split('\n')) if (key) keys.add(key);
    } catch {}
  }
  return keys;
}

function readStatus(ctx, file) {
  const lines = fileLines(file);
  if (!lines) return { missing: true };
  const keys = readKeys(ctx, file);
  const unread = [];
  let needed = 0;
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    needed++;
    if (!keys.has(lineKey(line))) unread.push(i + 1);
  });
  return { needed, unread, lines };
}

function spans(numbers, lines) {
  const out = [];
  for (const n of numbers) {
    const last = out[out.length - 1];
    if (last && lines.slice(last[1], n - 1).every((line) => !line.trim())) last[1] = n;
    else out.push([n, n]);
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`));
}

function describe(file, status) {
  if (status.missing) return `${file} (file not found; fix the path in ${CONFIG_NAME})`;
  if (status.unread.length === status.needed) return `${file} (not read yet)`;
  const list = spans(status.unread, status.lines);
  const shown = list.length > 6 ? `${list.slice(0, 6).join(', ')} and more` : list.join(', ');
  return `${file} (${status.unread.length} of ${status.needed} lines not read yet: lines ${shown})`;
}

function configEntries(projectDir) {
  const home = os.homedir();
  const user = { file: path.join(home, '.claude', CONFIG_NAME), base: home, scope: 'user' };
  const project = { file: path.join(projectDir, '.claude', CONFIG_NAME), base: projectDir, scope: 'project' };
  return norm(user.file) === norm(project.file) ? [user] : [project, user];
}

function loadConfig(entry) {
  let raw;
  try {
    raw = fs.readFileSync(entry.file, 'utf8');
  } catch {
    return null;
  }
  try {
    return { ...entry, cfg: JSON.parse(raw) };
  } catch (err) {
    return { ...entry, error: err.message };
  }
}

function escapes(rel) {
  return rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
}

function throughLink(base, resolved) {
  let cur = base;
  for (const seg of path.relative(base, resolved).split(path.sep)) {
    cur = path.join(cur, seg);
    try {
      if (fs.lstatSync(cur).isSymbolicLink()) return true;
    } catch {
      return false;
    }
  }
  return false;
}

function allowedPath(p, config, problems, label) {
  if (config.scope !== 'project') return expand(p, config.base);
  const outside = `${config.file}: ${label} names ${p}, which is outside the project; project rules may only name files inside the project.`;
  if (isNetworkPath(p)) {
    problems.push(`${config.file}: ${label} names a network or device path (${p}); project rules may only name files inside the project.`);
    return null;
  }
  const resolved = expand(p, config.base);
  if (escapes(path.relative(path.resolve(config.base), resolved))) {
    problems.push(outside);
    return null;
  }
  if (!DOC_EXT.has(path.extname(resolved).toLowerCase())) {
    problems.push(`${config.file}: ${label} names ${p}; project rules may only require documents (${[...DOC_EXT].join(' ')}).`);
    return null;
  }
  if (throughLink(path.resolve(config.base), resolved)) {
    problems.push(`${config.file}: ${label} names ${p}, which goes through a symbolic link; project rules may only name regular files inside the project.`);
    return null;
  }
  if (escapes(path.relative(real(config.base), real(resolved)))) {
    problems.push(outside);
    return null;
  }
  return resolved;
}

function parseConfig(config) {
  const problems = [];
  const rules = [];
  if (config.error) {
    problems.push(`${config.file} is not valid JSON (${config.error}). None of its rules are enforced.`);
    return { problems, rules, always: [] };
  }
  const cfg = config.cfg && typeof config.cfg === 'object' ? config.cfg : {};
  const entries = Array.isArray(cfg.rules) ? cfg.rules : [];
  entries.forEach((rule, i) => {
    const name = String((rule && rule.name) || `rule ${i + 1}`);
    if (!rule || !rule.match) {
      problems.push(`${config.file}: "${name}" has no "match" pattern and is not enforced.`);
      return;
    }
    const source = String(rule.match);
    if (source.includes('\b')) {
      problems.push(`${config.file}: "${name}" contains a backspace character, which never matches. In JSON a word boundary is written "\\\\b".`);
    }
    const flags = rule.flags === undefined ? 'i' : String(rule.flags).replace(/[gy]/g, '');
    try {
      new RegExp(source, flags);
    } catch (err) {
      problems.push(`${config.file}: "${name}" has an invalid pattern (${err.message}) and is not enforced.`);
      return;
    }
    const read = toList(rule.read)
      .map((p) => allowedPath(p, config, problems, `"${name}"`))
      .filter(Boolean);
    rules.push({ name, source, flags, read, note: rule.note ? String(rule.note) : '', file: config.file });
  });
  const always = toList(cfg.always)
    .map((p) => allowedPath(p, config, problems, '"always"'))
    .filter(Boolean);
  return { problems, rules, always };
}

function loadAll(projectDir) {
  const entries = configEntries(projectDir);
  const configs = entries.map(loadConfig).filter(Boolean);
  const parsed = configs.map(parseConfig);
  return {
    entries,
    configs,
    problems: parsed.flatMap((p) => p.problems),
    rules: parsed.flatMap((p) => p.rules),
    always: parsed.flatMap((p) => p.always),
  };
}

function ruleMatches(rule, fields, timeout) {
  const sandbox = vm.createContext({ source: rule.source, flags: rule.flags, fields });
  return vm.runInContext(
    '(() => { const rx = new RegExp(source, flags); return fields.some((f) => rx.test(f)); })()',
    sandbox,
    { timeout },
  );
}

function matchRules(rules, fields, problems) {
  const hits = [];
  const started = Date.now();
  for (const rule of rules) {
    const left = MATCH_BUDGET_MS - (Date.now() - started);
    if (left <= 0) {
      hits.push(rule);
      problems.push(`${rule.file}: "${rule.name}" was not tested because the rules used up the ${MATCH_BUDGET_MS} ms budget, so it is treated as matching. Simplify the slow patterns.`);
      continue;
    }
    try {
      if (ruleMatches(rule, fields, Math.max(1, Math.min(MATCH_TIMEOUT_MS, left)))) hits.push(rule);
    } catch {
      hits.push(rule);
      problems.push(`${rule.file}: "${rule.name}" took longer than ${MATCH_TIMEOUT_MS} ms to match, so it is treated as matching. Simplify the pattern.`);
    }
  }
  return hits;
}

function fieldsOf(input) {
  const out = [];
  const push = (value, limit) => {
    if (value === undefined || value === null || value === '') return;
    const text = limit ? String(value).slice(0, limit) : String(value);
    out.push(text);
    if (text.includes('\\')) out.push(text.replace(/\\/g, '/'));
  };
  push(input.command);
  push(input.file_path);
  push(input.notebook_path);
  push(input.content, CONTENT_CHARS);
  push(input.new_string, CONTENT_CHARS);
  push(input.new_source, CONTENT_CHARS);
  if (Array.isArray(input.edits)) for (const e of input.edits) if (e) push(e.new_string, CONTENT_CHARS);
  return out;
}

function emit(fields) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...fields } }));
}

function prune(current) {
  const root = stateRoot();
  let names = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return;
  }
  const cutoff = Date.now() - STATE_MAX_AGE_MS;
  for (const name of names) {
    if (name === current) continue;
    const dir = path.join(root, name);
    try {
      if (fs.statSync(dir).mtimeMs < cutoff) fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
}

function onSessionStart(data) {
  if (data.source === 'compact' || data.source === 'clear') {
    try {
      fs.rmSync(sessionDir(data.session_id), { recursive: true, force: true });
    } catch {}
  }
  prune(safe(data.session_id));
}

function onRead(ctx, input, response, projectDir) {
  if (!response || typeof response !== 'object' || !input.file_path) return;
  const { rules, always } = loadAll(projectDir);
  const wanted = new Set([...rules.flatMap((r) => r.read), ...always].map(norm));
  if (!wanted.has(norm(input.file_path))) return;
  const info = response.file || {};
  if (response.type === 'text') {
    const start = Number(info.startLine) || 1;
    recordRange(ctx, input.file_path, start, start + (Number(info.numLines) || 0) - 1);
  } else if (response.type === 'file_unchanged') {
    const start = Math.max(1, Number(input.offset) || 1);
    recordRange(ctx, input.file_path, start, start + (Number(input.limit) || DEFAULT_READ_LIMIT) - 1);
  }
}

function onToolCall(ctx, input, projectDir) {
  const { entries, configs, problems: allProblems, rules, always } = loadAll(projectDir);
  if (!configs.length) return;

  const target = input.file_path || input.notebook_path;
  if (target && entries.some((c) => norm(c.file) === norm(target))) return;

  const fields = fieldsOf(input);
  const problems = [...allProblems];
  const hits = fields.length ? matchRules(rules, fields, problems) : [];

  const fresh = problems.filter((p) => !hasFlag(ctx, `problem:${p}`));
  const context = [];
  if (fresh.length) {
    context.push('required-reading configuration problems:', ...fresh.map((p) => `  ${p}`));
    fresh.forEach((p) => setFlag(ctx, `problem:${p}`));
  }

  if (hits.length) {
    const required = [...new Map([...hits.flatMap((h) => h.read), ...always].map((f) => [norm(f), f])).values()];
    const pending = required
      .map((file) => ({ file, status: readStatus(ctx, file) }))
      .filter(({ status }) => status.missing || status.unread.length > 0);

    if (pending.length) {
      emit({
        permissionDecision: 'deny',
        permissionDecisionReason: [
          `Blocked by required-reading: this call matches ${hits.map((h) => `"${h.name}"`).join(', ')}.`,
          'Read these files in full with the Read tool in this session, then retry:',
          ...pending.map(({ file, status }) => `  ${describe(file, status)}`),
          ...(context.length ? ['', ...context] : []),
        ].join('\n'),
      });
      return;
    }

    for (const hit of hits) {
      if (hit.note && !hasFlag(ctx, `note:${hit.name}`)) {
        context.push(`required-reading, ${hit.name}: ${hit.note}`);
        setFlag(ctx, `note:${hit.name}`);
      }
    }
  }

  if (context.length) emit({ additionalContext: context.join('\n') });
}

function main() {
  const raw = readStdin();
  if (!raw.trim()) return;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }

  const event = data.hook_event_name;
  if (event === 'SessionStart') {
    onSessionStart(data);
    return;
  }

  const ctx = { session: data.session_id, agent: data.agent_id };
  const tool = data.tool_name || '';
  const input = data.tool_input && typeof data.tool_input === 'object' ? data.tool_input : {};
  const projectDir = process.env.CLAUDE_PROJECT_DIR || data.cwd || process.cwd();

  if (event === 'PostToolUse') {
    if (tool === 'Read') onRead(ctx, input, data.tool_response, projectDir);
    return;
  }
  if (tool === 'Read') return;
  onToolCall(ctx, input, projectDir);
}

main();
