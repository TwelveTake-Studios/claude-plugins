#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, lstatSync } from "node:fs";
import { join, relative, sep, resolve } from "node:path";

const MARKERS = /\b(?:verif(?:ied|ies|y)|measur(?:ed|es|ing|ements?)|tested|confirm(?:ed|s)|read from|per the|assumption|assumed|unconfirmed|unverified|estimat(?:e|ed|es)|guess|not established|unknown|approx|proposed|proposal|example)\b|\bsource:/i;
const HAS_URL = /https?:\/\/|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\/[^\s)]*/i;
const HAS_DATE = /\b20\d{2}-\d{2}-\d{2}\b/;

const FIGURE = /(?:[$\u20AC\u00A3]\s?\d[\d,.]*)|(?:\b\d+(?:\.\d+)?\s?%)|(?:\b\d{1,3}(?:,\d{3})+\b)|(?:\bv?\d+\.\d+\.\d+\b)/;

const SKIP_LINE = /^\s*(?:\||```|#{1,6}\s|>\s|[-*]\s+\[[ xX]\])/;
const args = process.argv.slice(2);

function fail(message) {
  console.error(`check-sources: ${message}`);
  process.exit(2);
}

const rootIdx = args.indexOf("--root");
if (rootIdx >= 0 && (!args[rootIdx + 1] || args[rootIdx + 1].startsWith("--"))) fail("--root needs a directory");
const root = resolve(rootIdx >= 0 ? args[rootIdx + 1] : ".");
let rootStat;
try {
  rootStat = statSync(root);
} catch {
  fail(`root not found: ${root}`);
}
if (!rootStat.isDirectory()) fail(`root is not a directory: ${root}`);
const writeBaseline = args.includes("--write-baseline");
const report = args.includes("--report");
const baselineFile = join(root, ".source-baseline.json");
const skipIdx = args.indexOf("--skip-dirs");
if (skipIdx >= 0 && (!args[skipIdx + 1] || args[skipIdx + 1].startsWith("--"))) fail("--skip-dirs needs a comma-separated list of directory names");
const skipDirs = new Set(skipIdx >= 0 ? args[skipIdx + 1].split(",").map((s) => s.trim()).filter(Boolean) : []);

function walk(dir, out = []) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = lstatSync(full);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      if (!skipDirs.has(entry)) walk(full, out);
    }
    else if (entry.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out;
}

function paragraphs(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let start = 0;
  for (let i = 0; i <= lines.length; i++) {
    if (i === lines.length || lines[i].trim() === "") {
      if (i > start) blocks.push({ start, end: i, text: lines.slice(start, i).join("\n") });
      start = i + 1;
    }
  }
  return { lines, blocks };
}

function unsourced(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    console.error(`check-sources: skipped ${file} (${err.code || err.message})`);
    return null;
  }
  const { lines, blocks } = paragraphs(text);
  let inFence = false;
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence || SKIP_LINE.test(line)) continue;
    if (!FIGURE.test(line.replace(/`[^`]*`/g, " "))) continue;
    const block = blocks.find(b => i >= b.start && i < b.end);
    const scope = block ? block.text : line;
    if (MARKERS.test(scope) || HAS_URL.test(scope) || HAS_DATE.test(scope)) continue;
    hits.push({ line: i + 1, text: line.trim().slice(0, 100) });
  }
  return hits;
}

const files = walk(root);
const counts = {};
const detail = {};
const scanned = new Set();
for (const f of files) {
  const rel = relative(root, f).split(sep).join("/");
  const hits = unsourced(f);
  if (hits === null) continue;
  scanned.add(rel);
  if (hits.length) { counts[rel] = hits.length; detail[rel] = hits; }
}

if (writeBaseline) {
  writeFileSync(baselineFile, JSON.stringify(counts, null, 2) + "\n");
  console.log(`baseline written: ${Object.keys(counts).length} files, ${Object.values(counts).reduce((a, b) => a + b, 0)} unsourced figures`);
  process.exit(0);
}

let baseline = {};
if (existsSync(baselineFile)) {
  try {
    baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
  } catch (err) {
    fail(`cannot read ${baselineFile} (${err.message})`);
  }
}

const inCi = args.includes("--ci") || (Boolean(process.env.CI) && !/^(?:0|false|no)$/i.test(process.env.CI));
const lowered = [];
for (const [file, allowed] of Object.entries(baseline)) {
  const gone = !scanned.has(file) && !existsSync(join(root, file));
  if (!scanned.has(file) && !gone) continue;
  const now = counts[file] ?? 0;
  if (now < allowed) {
    lowered.push(`${file}: ${allowed} -> ${now}`);
    if (now > 0) baseline[file] = now;
    else delete baseline[file];
  }
}
let stale = false;
if (lowered.length && inCi) {
  stale = true;
} else if (lowered.length) {
  try {
    writeFileSync(baselineFile, JSON.stringify(baseline, null, 2) + "\n");
    console.log(`check-sources: baseline lowered for ${lowered.length} file(s); commit .source-baseline.json`);
  } catch (err) {
    console.error(`check-sources: could not write the lowered baseline (${err.code || err.message}). Lower these entries by hand:`);
    for (const l of lowered) console.error(`  ${l}`);
  }
}

let failed = false;
for (const [file, n] of Object.entries(counts)) {
  const allowed = baseline[file] ?? 0;
  if (n > allowed) {
    failed = true;
    console.log(`FAIL ${file}: ${n} unsourced figures, baseline ${allowed}`);
    for (const h of detail[file].slice(0, 8)) console.log(`   ${h.line}: ${h.text}`);
  }
}

if (report) {
  const worst = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log("\nworst offenders:");
  for (const [file, n] of worst) console.log(`  ${String(n).padStart(4)}  ${file}`);
}

if (stale) {
  failed = true;
  console.log(`FAIL the baseline is stale for ${lowered.length} file(s). Run the check locally and commit .source-baseline.json:`);
  for (const l of lowered) console.log(`   ${l}`);
}

if (!failed) console.log(`check-sources: OK (${files.length} files scanned)`);
process.exit(failed ? 1 : 0);
