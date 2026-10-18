#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);

function fail(message) {
  console.error(`check-comments: ${message}`);
  process.exit(2);
}

function flagValue(name) {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  const value = argv[i + 1];
  if (!value || value.startsWith('--')) fail(`${name} needs a value`);
  return value;
}

const listFlag = (name) => {
  const value = flagValue(name);
  return value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];
};

const ROOT = path.resolve(flagValue('--root') ?? process.cwd());
let rootStat;
try {
  rootStat = fs.statSync(ROOT);
} catch {
  fail(`root not found: ${ROOT}`);
}
if (!rootStat.isDirectory()) fail(`root is not a directory: ${ROOT}`);
const BASELINE = path.join(ROOT, '.comment-baseline.json');

const DEFAULT_EXT = ['.ts', '.tsx', '.mjs', '.cjs', '.js', '.jsx', '.svelte', '.vue', '.astro', '.css', '.html', '.sql', '.prisma'];
const SUPPORTED_EXT = new Set([...DEFAULT_EXT, '.py', '.rs', '.md', '.mdx', '.scss', '.less']);
const EXTRA_EXT = listFlag('--ext').map((e) => (e.startsWith('.') ? e : `.${e}`).toLowerCase());
for (const e of EXTRA_EXT) {
  if (!SUPPORTED_EXT.has(e)) fail(`unsupported extension ${e}; supported: ${[...SUPPORTED_EXT].join(' ')}`);
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', '.astro', '.svelte-kit', 'coverage', 'out', '.turbo', '.nx', 'tmp', '.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.tox', 'target', 'vendor', '__snapshots__', 'out-tsc', 'test-output', 'test-results', 'playwright-report', ...listFlag('--skip-dirs')]);
const EXT = new Set([...DEFAULT_EXT, ...EXTRA_EXT]);

const LICENSE_TEXT = /Permission is hereby granted|Licensed under the|SPDX-License-Identifier|Redistribution and use in source|THE SOFTWARE IS PROVIDED/i;
const LICENSE_LINE = /^\s*(?:@(?:license|preserve)\b|copyright\b|\(c\)\s)/i;
const DIRECTIVE_WHOLE = /^\s*(?:M?!\d{5,6}\s|biome-ignore\b|<reference\s|globals?\s+[\w$]+(?::\s*\w+)?(?:\s*,\s*[\w$]+(?::\s*\w+)?)*\s*$|webpack[A-Z]\w*\s*:|eslint\s+[@\w/-]+\s*:\s*(?:off|warn|error|[0-2]|\[))/i;
const DIRECTIVE_TOKEN = /^\s*(?:eslint-(?:disable|enable)(?:-next-line|-line)?(?:\s+[@a-z][@\w/-]*(?:\s*,\s*[@a-z][@\w/-]*)*)?|eslint-env(?:\s+[a-z][\w-]*(?:\s*,\s*[a-z][\w-]*)*)?|@ts-(?:ignore|expect-error|nocheck|check)\b|prettier-ignore\b|(?:c8|v8|istanbul)\s+ignore(?:\s+(?:next|if|else|start|stop|file))?\b|@vite-ignore\b|@vitest-environment\s+\S+|@jsx(?:ImportSource|Runtime|Frag)?\s+\S+|@type\s*\{.*\}|[#@]__PURE__|\$FlowFixMe\b)/i;
const SECRETISH = /:\s*\S*\d|\b\d{1,3}(?:\.\d{1,3}){3}\b|=|\S+@\S+\.\S+|\b(?:secrets?|api[ -]?keys?|access[ -]keys?)\s*[:=]/i;
const RULE_ONLY = /^[\s\-=*_~#/.+|\u2500-\u257F]*$/;
const STATUS = /^(DEPRECATED|OPTIMIZE|NOTE|NOTES|WARNING|STATUS|FUTURE|REVIEW|TEMP)\b\s*[:\-\u2013\u2014]/i;
const STATUS_HARD = /^(TODO|FIXME|HACK|XXX|WIP|BUG)\b/i;
const NOT_A_LABEL = /\b(?:don'?t|do not|unverified|for now|not yet|later|someday|temporary|temporarily|hacks?|workaround|before (?:launch|release|shipping|deploying|going live)|passwords?|credentials?)\b/i;

const NAME_MAX_WORDS = 4;
const NAME_MAX_CHARS = 32;

function isSeparator(text) {
  const t = text.replace(/^[-=*_~#/\s\u2500-\u257F]+/, '').replace(/[-=*_~#/\s\u2500-\u257F]+$/, '').trim();
  if (t === '') return true;
  if (STATUS.test(t) || STATUS_HARD.test(t) || NOT_A_LABEL.test(t) || SECRETISH.test(t)) return false;
  if (/[.!?;:,]$/.test(t) || t.includes(',')) return false;
  return t.split(/\s+/).length <= NAME_MAX_WORDS && t.length <= NAME_MAX_CHARS;
}

function extractComments(src) {
  const out = [];
  let i = 0, line = 1, inS = null, tpl = 0, inRe = false;
  const n = src.length;
  const BS = String.fromCharCode(92);
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === '\n') { line++; inS = null; inRe = false; i++; continue; }
    if (inS) { if (c === BS) { if (c2 === '\n') line++; i += 2; continue; } if (c === inS) inS = null; i++; continue; }
    if (inRe) { if (c === BS) { i += 2; continue; } if (c === '/') inRe = false; i++; continue; }
    if (tpl) { if (c === BS) { i += 2; continue; } if (c === '`') tpl--; i++; continue; }
    if (c === '"' || c === "'") { inS = c; i++; continue; }
    if (c === '`') { tpl++; i++; continue; }
    if (c === '/' && c2 === '/' && src[i - 1] === ':' && /\S/.test(src[i + 2] || '')) { i += 2; continue; }
    if (c === '/' && c2 === '/') {
      const j = src.indexOf('\n', i);
      const end = j === -1 ? n : j;
      out.push({ line, text: src.slice(i + 2, end) });
      i = end; continue;
    }
    if (c === '/' && c2 === '*') {
      const j = src.indexOf('*/', i + 2);
      const end = j === -1 ? n : j + 2;
      const bodyText = src.slice(i + 2, end - 2);
      out.push({ line, text: bodyText });
      line += (bodyText.match(/\n/g) || []).length;
      i = end; continue;
    }
    if (c === '/') {
      let k = i - 1;
      while (k >= 0 && /\s/.test(src[k])) k--;
      let regexOk = k < 0 || /[(,=:[&|?{};+\-*%~^]/.test(src[k]);
      if (!regexOk && src[k] === '!') {
        let m = k - 1;
        while (m >= 0 && /\s/.test(src[m])) m--;
        regexOk = m < 0 || !/[\w$)\]'"`]/.test(src[m]);
      }
      if (regexOk) { inRe = true; i++; continue; }
    }
    i++;
  }
  return out;
}

function lineAt(src, index) {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

function extractAstroComments(src) {
  const out = [];
  let templateStart = 0;

  if (src.startsWith('---')) {
    const fenceEnd = src.indexOf('\n---', 3);
    if (fenceEnd !== -1) {
      const fm = src.slice(3, fenceEnd);
      for (const c of extractComments(fm)) out.push({ line: c.line, text: c.text });
      templateStart = fenceEnd + 4;
    }
  }

  const template = src.slice(templateStart);
  const base = lineAt(src, templateStart) - 1;

  for (const m of template.matchAll(/\{\s*\/\*([\s\S]*?)\*\/\s*\}/g)) {
    out.push({ line: base + lineAt(template, m.index), text: m[1] });
  }
  for (const m of template.matchAll(/<!--([\s\S]*?)-->/g)) {
    out.push({ line: base + lineAt(template, m.index), text: m[1] });
  }

  for (const m of template.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const inner = m[1];
    const innerLine = base + lineAt(template, m.index + m[0].indexOf(inner));
    for (const c of extractComments(inner)) out.push({ line: innerLine + c.line - 1, text: c.text });
  }

  for (const m of template.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)) {
    const innerLine = base + lineAt(template, m.index + m[0].indexOf(m[2], m[1].length));
    for (const c of styleComments(m[1], m[2])) out.push({ line: innerLine + c.line - 1, text: c.text });
  }

  return out;
}

function styleComments(attrs, css) {
  const lineComments = /\blang\s*=\s*["']?(?:scss|sass|less|styl|stylus)\b/i.test(attrs);
  return extractBlockComments(css, lineComments ? '//' : undefined);
}

function extractBlockComments(src, lineComment) {
  const out = [];
  let i = 0, line = 1, inS = null;
  const n = src.length;
  const BS = String.fromCharCode(92);
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === '\n') { line++; i++; continue; }
    if (inS) { if (c === BS) { i += 2; continue; } if (c === inS) inS = null; i++; continue; }
    if (c === '"' || c === "'") { inS = c; i++; continue; }
    if (lineComment === '//' && c === '/' && c2 === '/' && src[i - 1] === ':' && /\S/.test(src[i + 2] || '')) { i += 2; continue; }
    if (lineComment && c === lineComment[0] && src.startsWith(lineComment, i)) {
      const j = src.indexOf('\n', i);
      const end = j === -1 ? n : j;
      out.push({ line, text: src.slice(i + lineComment.length, end) });
      i = end; continue;
    }
    if (c === '/' && c2 === '*') {
      const j = src.indexOf('*/', i + 2);
      const end = j === -1 ? n : j + 2;
      const bodyText = src.slice(i + 2, end - 2);
      out.push({ line, text: bodyText });
      line += (bodyText.match(/\n/g) || []).length;
      i = end; continue;
    }
    i++;
  }
  return out;
}

function extractRustComments(src) {
  const out = [];
  const n = src.length;
  let i = 0, line = 1;
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && c2 === '/') {
      const j = src.indexOf('\n', i);
      const end = j < 0 ? n : j;
      out.push({ line, text: src.slice(i + 2, end).replace(/^[/!]/, '') });
      i = end;
      continue;
    }
    if (c === '/' && c2 === '*') {
      const startLine = line;
      let depth = 1, j = i + 2;
      while (j < n && depth > 0) {
        if (src.startsWith('/*', j)) { depth++; j += 2; }
        else if (src.startsWith('*/', j)) { depth--; j += 2; }
        else { if (src[j] === '\n') line++; j++; }
      }
      out.push({ line: startLine, text: src.slice(i + 2, Math.max(i + 2, j - 2)).replace(/^[*!]/, '') });
      i = j;
      continue;
    }
    const prev = i > 0 ? src[i - 1] : '';
    const identBefore = /[A-Za-z0-9_]/.test(prev);
    if ((c === 'r' || (c === 'b' && c2 === 'r')) && !identBefore) {
      let j = c === 'b' ? i + 2 : i + 1, hashes = 0;
      while (src[j] === '#') { hashes++; j++; }
      if (src[j] === '"') {
        const close = '"' + '#'.repeat(hashes);
        const k = src.indexOf(close, j + 1);
        const end = k < 0 ? n : k + close.length;
        for (let m = i; m < end; m++) if (src[m] === '\n') line++;
        i = end;
        continue;
      }
    }
    if (c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== '"') { if (src[j] === '\\') j++; j++; }
      for (let m = i; m < j && m < n; m++) if (src[m] === '\n') line++;
      i = j + 1;
      continue;
    }
    if (c === "'") {
      if (c2 === '\\') { const k = src.indexOf("'", i + 2); i = k < 0 ? i + 1 : k + 1; continue; }
      if (src[i + 2] === "'") { i += 3; continue; }
      const cp = src.codePointAt(i + 1);
      const width = cp !== undefined && cp > 0xffff ? 2 : 1;
      if (src[i + 1 + width] === "'") { i += 2 + width; continue; }
      i++;
      continue;
    }
    i++;
  }
  return out;
}

function extractHtmlComments(src) {
  const out = [];
  for (const m of src.matchAll(/<!--([\s\S]*?)-->/g)) {
    if (/^\s*\[if\b|<!\[endif\]/i.test(m[1])) continue;
    out.push({ line: lineAt(src, m.index), text: m[1] });
  }
  for (const m of src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const innerLine = lineAt(src, m.index + m[0].indexOf(m[1]));
    for (const c of extractComments(m[1])) out.push({ line: innerLine + c.line - 1, text: c.text });
  }
  for (const m of src.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)) {
    const innerLine = lineAt(src, m.index + m[0].indexOf(m[2], m[1].length));
    for (const c of styleComments(m[1], m[2])) out.push({ line: innerLine + c.line - 1, text: c.text });
  }
  return out;
}

function blankFences(src) {
  return src.replace(/^(```|~~~)[\s\S]*?^\1/gm, (m) => m.replace(/[^\n]/g, ' '));
}

function extractMarkdownComments(src) {
  const text = blankFences(src);
  const out = [];
  for (const m of text.matchAll(/<!--([\s\S]*?)-->/g)) out.push({ line: lineAt(text, m.index), text: m[1] });
  return out;
}

function extractMdxComments(src) {
  const text = blankFences(src);
  const out = extractMarkdownComments(src);
  for (const m of text.matchAll(/\{\s*\/\*([\s\S]*?)\*\/\s*\}/g)) out.push({ line: lineAt(text, m.index), text: m[1] });
  return out;
}

const EXTRACTORS = {
  '.astro': extractAstroComments,
  '.css': (src) => extractBlockComments(src),
  '.scss': (src) => extractBlockComments(src, '//'),
  '.less': (src) => extractBlockComments(src, '//'),
  '.sql': (src) => extractBlockComments(src, '--'),
  '.py': (src) => extractBlockComments(src, '#'),
  '.rs': extractRustComments,
  '.html': extractHtmlComments,
  '.vue': extractHtmlComments,
  '.svelte': extractHtmlComments,
  '.md': extractMarkdownComments,
  '.mdx': extractMdxComments,
};

function withoutDirectives(lines) {
  if (lines.some((l) => LICENSE_TEXT.test(l))) return [];
  return lines.filter((l) => !LICENSE_LINE.test(l)).flatMap((l) => {
    if (DIRECTIVE_WHOLE.test(l)) return [];
    const m = DIRECTIVE_TOKEN.exec(l);
    if (!m) return [l];
    const rest = l.slice(m.index + m[0].length).trim().replace(/^--\s*/, '').trim();
    return rest ? [rest] : [];
  });
}

function violationsIn(file) {
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`check-comments: skipped ${file} (${err.code || err.message})`);
    return null;
  }
  const bad = [];
  const extract = EXTRACTORS[path.extname(file).toLowerCase()] ?? extractComments;
  for (const c of extract(src)) {
    const raw = c.text.split('\n').map((l) => l.replace(/^\s*\*?\s?/, '')).filter((l) => l.trim() !== '');
    const lines = withoutDirectives(raw).filter((l) => l.trim() !== '');
    if (lines.length === 0) continue;
    if (lines.length === 1 && (RULE_ONLY.test(lines[0]) || isSeparator(lines[0]))) continue;
    bad.push({ line: c.line, sample: lines[0].trim().slice(0, 70) });
  }
  return bad;
}

function walk(dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, acc); }
    else if (EXT.has(path.extname(e.name).toLowerCase())) acc.push(p);
  }
  return acc;
}

const counts = {}, detail = {};
const scanned = new Set();
for (const f of walk(ROOT)) {
  const v = violationsIn(f);
  if (v === null) continue;
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  scanned.add(rel);
  if (v.length) { counts[rel] = v.length; detail[rel] = v; }
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (argv.includes('--write-baseline')) {
  fs.writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + '\n');
  console.log(`check-comments: baseline written - ${Object.keys(counts).length} files, ${total} comments`);
  process.exit(0);
}

let base = {};
if (fs.existsSync(BASELINE)) {
  try {
    base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  } catch (err) {
    fail(`cannot read ${BASELINE} (${err.message})`);
  }
}

const IN_CI = argv.includes('--ci') || (Boolean(process.env.CI) && !/^(?:0|false|no)$/i.test(process.env.CI));
const lowered = [];
for (const [f, allowed] of Object.entries(base)) {
  const gone = !scanned.has(f) && !fs.existsSync(path.join(ROOT, f));
  if (!scanned.has(f) && !gone) continue;
  const now = counts[f] ?? 0;
  if (now < allowed) {
    lowered.push(`${f}: ${allowed} -> ${now}`);
    if (now > 0) base[f] = now;
    else delete base[f];
  }
}
let stale = false;
if (lowered.length && IN_CI) {
  stale = true;
} else if (lowered.length) {
  try {
    fs.writeFileSync(BASELINE, JSON.stringify(base, null, 2) + '\n');
    console.log(`check-comments: baseline lowered for ${lowered.length} file(s); commit ${path.basename(BASELINE)}`);
  } catch (err) {
    console.error(`check-comments: could not write the lowered baseline (${err.code || err.message}). Lower these entries by hand:`);
    for (const l of lowered) console.error(`  ${l}`);
  }
}

const regressions = [];
for (const [f, n] of Object.entries(counts)) {
  const allowed = base[f] ?? 0;
  if (n > allowed) regressions.push({ f, n, allowed, samples: detail[f].slice(0, 3) });
}
const baseTotal = Object.values(base).reduce((a, b) => a + b, 0);

if (regressions.length) {
  console.error('check-comments: FAIL - descriptive comments added.');
  console.error('Rule: section separators only. No explanation, reasoning, history or status.');
  for (const r of regressions) {
    console.error(`  ${r.f}: ${r.n} (allowed ${r.allowed})`);
    for (const s of r.samples) console.error(`      L${s.line}: ${s.sample}`);
  }
}
if (stale) {
  console.error(`check-comments: FAIL - the baseline is stale for ${lowered.length} file(s). Run the check locally and commit ${path.basename(BASELINE)}:`);
  for (const l of lowered) console.error(`  ${l}`);
}
if (regressions.length || stale) process.exit(1);

console.log(`check-comments: OK - ${total} remaining (baseline ${baseTotal}), no file regressed`);
if (argv.includes('--report')) {
  const worst = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 25);
  for (const [f, n] of worst) console.log(`  ${String(n).padStart(4)}  ${f}`);
}
