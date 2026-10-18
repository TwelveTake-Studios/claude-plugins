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
const hook = path.join(here, '..', 'plugins', 'found-bugs', 'hooks', 'stop.mjs');

function stop(payload) {
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify(payload), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

const say = (message, extra = {}) => stop({ hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: message, ...extra });

const DISMISSALS = [
  'Done. The two test failures are pre-existing and unrelated to my change.',
  'All green except auth.spec.ts, which is a pre-existing failure.',
  'The lint errors in utils.js are all pre-existing.',
  'test_export was already failing before I started.',
  'Those tests fail before my changes too, so I left them.',
  'The crash in the importer is unrelated to this PR.',
  'This warning is not caused by my edits.',
  'The type errors were not introduced by these changes.',
  'Two tests are pre-existing failures and should be fixed separately.',
  'The lint errors are pre-existing and can be fixed in a follow-up.',
  'The failure is unrelated to my change and was not fixed.',
  'The date test also fails on main.',
  'This happens on main without my changes.',
  'The bug already existed before my change.',
  `It isn${String.fromCharCode(0x2019)}t caused by my change.`,
  '- No regressions from the refactor; the two failures in auth.spec.ts are pre-existing.',
  'The two failures are pre-existing and should be fixed in a separate PR.',
  'The lint errors are pre-existing and can be fixed in their own commit later.',
  'The type errors in api.ts are not caused by my change, and we fixed nothing there.',
  'The lint errors in legacy.js are pre-existing. I fixed the date parsing bug you reported in utils.ts.',
  'No, that test is unrelated to my change.',
  'Fixed the typo; the pre-existing failures remain.',
  'Fixed the date bug, but the two lint errors in legacy.js are pre-existing.',
  'Fixed the date parsing bug and left the two pre-existing lint errors in legacy.js alone.',
  '- Updated the README. Fixed the typo in the header, and the auth test failures are pre-existing.',
  'The lint errors in legacy.js are pre-existing. I also fixed this typo in the README.',
];

for (const message of DISMISSALS) {
  test(`sends Claude back for: ${message}`, () => {
    const out = say(message);
    assert.equal(out && out.decision, 'block');
    assert.match(out.reason, /not a reason to leave a bug/);
  });
}

const FINE = [
  'Added the export button and its tests. All 48 tests pass.',
  'I fixed a pre-existing bug in parse() in its own commit.',
  'The pre-existing failure in auth.spec.ts is now fixed: the fixture had an expired date.',
  'I kept the pre-existing configuration file as it was.',
  'Here is the log:\n```\nERROR pre-existing failure in module x\n```\nI fixed the cause in loader.js.',
  'The `pre-existing failures` label in the dashboard now counts correctly.',
  'All 48 pre-existing tests still pass.',
  'I kept the pre-existing tests.',
  'No pre-existing failures were found.',
  'There were no failing tests before or after the change.',
  'test_total fails before the change and passes after it.',
  'It was already failing on main and passes with the patch.',
  'Two tests were already failing on main. I fixed both in a separate commit.',
  'Fixed: the pre-existing failure in auth.spec.ts was a stale fixture.',
  '- Fixed a pre-existing bug in parse() that dropped the last row.',
  'Pre-existing bug fixed: parse() dropped the last row.',
  'Resolved the pre-existing test failures in queue.spec.ts by resetting the clock.',
  'The date test also fails on main. Fixed by pinning the clock in the fixture.',
  'Verified: the crash reproduces without the patch and is gone with it.',
  'Two tests were already failing on main, but I fixed both in a separate commit.',
  'The pre-existing failure in auth.spec.ts was fixed by correcting the fixture date.',
  'The failures in importer.ts and exporter.ts were pre-existing, and they are now fixed.',
];

for (const message of FINE) {
  test(`lets this through: ${message.split('\n')[0]}`, () => {
    assert.equal(say(message), null);
  });
}

test('the message lets an already-fixed problem be closed in one line', () => {
  const out = say(DISMISSALS[0]);
  assert.match(out.reason, /If that problem is already fixed, say so in one line and finish\./);
});

const REMOVALS = [
  'I removed the autosave feature to fix the crash on save.',
  'Disabled the cache so the stale-price bug no longer appears.',
  'Commented out the failing validation to get the build green.',
  'The retry logic was removed, which fixes the duplicate orders.',
  'I skipped the flaky test so the suite passes.',
  'Turned off the preview mode as a workaround for the memory leak.',
  'I removed the percent function and its test so the suite passes.',
];

for (const message of REMOVALS) {
  test(`sends Claude back for removing a feature: ${message}`, () => {
    const out = say(message);
    assert.equal(out && out.decision, 'block');
    assert.match(out.reason, /Restore what was removed or disabled and fix the cause/);
  });
}

const NOT_REMOVALS = [
  'Removed the debug logging.',
  'Removed the duplicate import that caused the crash.',
  'I did not remove the export feature; I fixed the encoding bug instead.',
  'Fixed the crash in autosave and the feature still works.',
  'Removed the unused helper file.',
  "I didn't disable the cache; the stale price came from a missing invalidation, now fixed.",
  'I did not disable the cache to fix the stale prices; the invalidation was missing, and it is fixed now.',
];

for (const message of NOT_REMOVALS) {
  test(`does not treat this as removing a feature: ${message}`, () => {
    const out = say(message);
    assert.ok(!out || !/Restore what was removed/.test(out.reason), message);
  });
}

test('fires at most once per turn', () => {
  assert.equal(say(DISMISSALS[0], { stop_hook_active: true }), null);
});

test('quotes the sentence that triggered it', () => {
  const out = say('Implemented the feature. The lint errors in utils.js are all pre-existing. Let me know.');
  assert.ok(out.reason.includes('"The lint errors in utils.js are all pre-existing."'));
});

test('keeps inline code in the quoted sentence', () => {
  const out = say('It fails because `percent(1, 0)` returns `Infinity`, so it is unrelated to my change.');
  assert.ok(out.reason.includes('`percent(1, 0)` returns `Infinity`'));
});

test('applies to subagents', () => {
  const out = stop({ hook_event_name: 'SubagentStop', stop_hook_active: false, last_assistant_message: DISMISSALS[3] });
  assert.equal(out && out.decision, 'block');
});

test('falls back to the transcript when the message is not in the payload', () => {
  const dir = tempDir('found-bugs-');
  const transcript = path.join(dir, 't.jsonl');
  const rows = [
    { type: 'user', message: { role: 'user', content: 'add the button' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Earlier note.' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: DISMISSALS[0] }] } },
  ];
  fs.writeFileSync(transcript, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const out = stop({ hook_event_name: 'Stop', stop_hook_active: false, transcript_path: transcript });
  assert.equal(out && out.decision, 'block');
});

test('does nothing on empty or malformed input', () => {
  for (const input of ['', 'not json', '{}']) {
    const r = spawnSync(process.execPath, [hook], { input, encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '');
  }
});
