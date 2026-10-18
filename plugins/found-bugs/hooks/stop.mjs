#!/usr/bin/env node
import fs from 'node:fs';

const NOUN = '(?:issues?|bugs?|failures?|errors?|problems?|warnings?|test failures?|failing tests?|defects?|crash(?:es)?|regressions?)';
const CHANGE = '(?:my|this|these|the|our)\\s+(?:\\w+\\s+)?(?:changes?|edits?|work|task|fix|pr|pull request|commit|diff|patch)';
const MAIN = '(?:main|master|trunk|the main branch|the base branch)';
const DASHES = String.fromCharCode(0x2013, 0x2014);
const FIX_VERB = '(?:fixed|repaired|resolved|corrected|patched)';
const NOT_NOTHING = '(?!\\s+(?:nothing|none|neither)\\b)';

const DISMISSALS = [
  { rx: new RegExp(`\\bpre-?existing\\s+(?:\\w+\\s+){0,2}${NOUN}\\b`, 'i') },
  { rx: new RegExp(`\\b${NOUN}\\b(?:[^.!?\\n]|[.!?](?=\\S)){0,60}\\b(?:is|are|was|were)\\s+(?:all\\s+)?pre-?existing\\b`, 'i') },
  { rx: /\b(?:is|are|was|were)\s+already\s+(?:failing|broken)\b/i, unlessPasses: true },
  { rx: /\bfail(?:ed|s|ing)?\s+before\s+(?:my|this|these|the)\s+(?:changes?|edits?)\b/i, unlessPasses: true },
  { rx: new RegExp(`\\b(?:also\\s+)?fail(?:s|ed|ing)?\\s+on\\s+${MAIN}\\b`, 'i'), unlessPasses: true },
  { rx: /\b(?:happens|happened|occurs|occurred|fails|failed|reproduces)\b[^.!?\n]{0,40}\bwithout\s+(?:my|this|these|the)\s+(?:changes?|edits?|patch)\b/i, unlessPasses: true },
  { rx: /\b(?:already\s+)?existed\s+before\s+(?:my|this|these|the)\s+(?:changes?|edits?|work)\b/i },
  { rx: new RegExp(`\\b(?:unrelated|not related)\\s+to\\s+${CHANGE}\\b`, 'i') },
  { rx: new RegExp(`\\b(?:not|wasn't|weren't|isn't|aren't)\\s+(?:caused|introduced)\\s+by\\s+${CHANGE}\\b`, 'i') },
];

const RESOLVED = [
  new RegExp(`\\b(?:I|we)\\s+(?:have\\s+|also\\s+|then\\s+|just\\s+)?${FIX_VERB}\\b${NOT_NOTHING}`, 'i'),
  new RegExp(`^(?:[-*]\\s*)?${FIX_VERB}\\b${NOT_NOTHING}`, 'i'),
  new RegExp(`\\b${NOUN}\\s+(?:(?:is|are|was|were|now|has been|have been)\\s+)?${FIX_VERB}\\b`, 'i'),
  new RegExp(`\\b${NOUN}\\b(?:\\s+\\S+){0,6}?\\s+(?:is|are|was|were|has been|have been)\\s+(?:now\\s+|all\\s+)?${FIX_VERB}\\b`, 'i'),
  /\b(?:is|are|was|were)\s+now\s+(?:fixed|resolved|repaired|passing|green)\b/i,
  /\bnow\s+pass(?:es|ing)?\b/i,
  /(?<!\bbe\s+)\bfixed\s+(?:it|them|that|this|both)?\s*in\s+(?:a\s+separate|its\s+own|their\s+own|commit)\b/i,
];

const REFERS_BACK = [
  new RegExp(`\\b${FIX_VERB}\\s+(?:it|them|both|those|these|that|this|all(?:\\s+of\\s+them)?)(?=\\s*(?:[.,;:!)]|$|\\s+(?:in|by|with|too|as well|now|first|separately|already)\\b))`, 'i'),
  /\b(?:it|they|both|those|these|all\s+\w+)\s+(?:(?:is|are|was|were)\s+)?now\s+(?:fixed|resolved|passing|pass(?:es)?)\b/i,
  /\b(?:it|they|both|those|these)\s+(?:has|have)\s+been\s+(?:fixed|resolved|repaired)\b/i,
  new RegExp(`^(?:[-*]\\s*)?${FIX_VERB}\\s+(?:by|with|in)\\b`, 'i'),
];

const PASSES = /\b(?:pass(?:es|ed|ing)?|green)\s+(?:after|with|once|now)\b|\bnow\s+pass(?:es|ing)?\b|\b(?:gone|fixed)\s+(?:with|after)\b|\bno\s+longer\s+(?:fails|reproduces|happens|occurs)\b/i;
const NEGATED = new RegExp(`^(?:no\\b(?!\\s*[,${DASHES}-])|none\\b|there\\s+(?:were|was|are|is)\\s+no\\b)|\\bno\\s+pre-?existing\\b`, 'i');
const CURLY_APOSTROPHE = new RegExp(String.fromCharCode(0x2019), 'g');
const CLAUSE = /;\s+|,?\s+(?:but|while|although|though|however|whereas)\s+|,\s+and\s+|\s+and\s+(?=(?:left|kept|skipped|ignored)\b)/i;

function lastAssistantText(transcriptPath) {
  let rows;
  try {
    rows = fs.readFileSync(transcriptPath, 'utf8').split('\n');
  } catch {
    return '';
  }
  for (let i = rows.length - 1; i >= 0; i--) {
    if (!rows[i].trim()) continue;
    let row;
    try {
      row = JSON.parse(rows[i]);
    } catch {
      continue;
    }
    if (row.type !== 'assistant' || !row.message || !Array.isArray(row.message.content)) continue;
    const text = row.message.content.filter((c) => c && c.type === 'text').map((c) => c.text).join('\n');
    if (text.trim()) return text;
  }
  return '';
}

function sentences(text) {
  return text
    .replace(CURLY_APOSTROPHE, "'")
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const plain = (text) => text.replace(/`[^`\n]*`/g, ' ');
const unbullet = (text) => text.replace(/^[-*\d.)\s]+/, '');
const any = (list, text) => list.some((rx) => rx.test(text));

function dismisses(part, sentence) {
  if (NEGATED.test(unbullet(part))) return false;
  return DISMISSALS.some(({ rx, unlessPasses }) => rx.test(part) && !(unlessPasses && PASSES.test(sentence)));
}

function findDismissal(list) {
  for (let i = 0; i < list.length; i++) {
    const sentence = plain(list[i]);
    const next = list[i + 1] ? unbullet(plain(list[i + 1])) : '';
    if (next && any(REFERS_BACK, next)) continue;
    const clauses = sentence.split(CLAUSE);
    if (clauses.some((clause) => any(REFERS_BACK, unbullet(clause)))) continue;
    for (const clause of clauses) {
      if (any(RESOLVED, unbullet(clause)) || any(RESOLVED, clause)) continue;
      if (clause.split(/:\s+/).some((part) => dismisses(part, sentence))) return list[i];
    }
  }
  return null;
}

function main() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return;
  }
  if (data.stop_hook_active) return;

  let message = typeof data.last_assistant_message === 'string' ? data.last_assistant_message : '';
  if (!message) message = lastAssistantText(data.agent_transcript_path || data.transcript_path || '');
  if (!message) return;

  const dismissal = findDismissal(sentences(message));
  if (!dismissal) return;

  const quoted = dismissal.length > 200 ? `${dismissal.slice(0, 200)}...` : dismissal;
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason: [
        `Your last message describes a problem by when it arrived: "${quoted}"`,
        'If that problem is already fixed, say so in one line and finish.',
        'Otherwise: being pre-existing or unrelated to the current change is not a reason to leave a bug.',
        'If it is in this codebase and the fix is clear, fix it now in its own commit and say what you changed.',
        "If it needs the user's decision, is risky, or lives in another system, report it specifically: what it is, where, the evidence, and what a fix would need.",
        'If a known-issues register already rules on it, name the entry. Then finish.',
      ].join(' '),
    }),
  );
}

main();
