---
name: check-comments
description: Fail a codebase when any file gains descriptive comments, allowing only short labels that name a section. Use when the user wants explanatory or AI-style comments kept out of the code, asks to run or set up a comment check or baseline, or asks for comments to be removed.
---

# Comment ratchet

`scripts/check-comments.mjs` allows one kind of comment: a short label that names a region of code, such as `// Header`, `/* Layout */` or `<!-- Footer -->`. Everything else counts: explanations, reasoning, history, status notes, TODOs, values, and notes about what is unverified or must not ship.

It ratchets. `.comment-baseline.json` at the scan root records how many violations each file already has, and the check fails only when a file goes above its own count. When a file improves, a local run lowers its entry automatically, so the baseline only ever goes down. Commit the updated baseline with the change that cleaned the file. In CI the baseline is never rewritten: a baseline that should have gone down fails the check, so a stale count cannot let new comments back in.

## Running it

```
node "${CLAUDE_SKILL_DIR}/scripts/check-comments.mjs" --root .
```

| Option | Effect |
|---|---|
| `--root <dir>` | Directory to scan. Defaults to the current directory. |
| `--write-baseline` | Record the current counts in `<root>/.comment-baseline.json` and exit. |
| `--report` | After the check, list the 25 files with the most violations. |
| `--ext .py,.md` | Also scan these types. Supported: `.py .rs .md .mdx .scss .less`. |
| `--skip-dirs bin,obj` | Skip more directory names. |
| `--ci` | CI mode, also turned on by a `CI` environment variable. |

Scanned by default: `.ts .tsx .mjs .cjs .js .jsx .svelte .vue .astro .css .html .sql .prisma`. In `.vue`, `.svelte`, `.astro` and `.html` files, HTML comments are checked along with the script and style blocks, including `//` comments in SCSS, Less and Stylus style blocks. In Markdown, HTML comments outside code fences are checked. Skipped directories include `node_modules`, `dist`, `build`, `.git`, `.next`, `.svelte-kit`, `coverage`, `venv`, `.venv`, `__pycache__`, `target`, `vendor`, `test-output`, `test-results` and `playwright-report`.

| Exit code | Meaning |
|---|---|
| 0 | No file went above its baseline. |
| 1 | At least one file regressed, or in CI the baseline is stale. Each regressed file is listed with up to three sample lines. |
| 2 | The check could not run: the root is missing or not a directory, a flag has no value, an extension is not supported, or the baseline file is unreadable. |

If a local run cannot write the lowered baseline, it lists the entries to lower by hand and carries on.

## What passes

- A single-line label of at most four words and 32 characters, such as `Step 3: Date` or `Delete Modal`.
- Not a label: anything with a comma; anything ending in `.`, `!`, `?`, `;`, `:` or `,`; anything carrying a value, such as a digit after a colon, an IP address, `=`, an email address, or `secret:`/`API key:`; anything starting with TODO, FIXME, HACK, XXX, WIP or BUG, or with NOTE, WARNING, STATUS and similar words followed by a colon; and anything containing do not, don't, unverified, for now, not yet, later, someday, temporary, hack, workaround, before launch (or release, shipping, deploying, going live), password or credentials.
- Divider characters (`-`, `=`, `*`, `#`, `~` and box-drawing characters from U+2500 to U+257F) around a label are ignored, and a line made only of them passes.
- Tool directives: `eslint-disable`/`eslint-enable` with their rule list, `eslint-env`, `/* eslint rule: severity */`, `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`/`@ts-check`, `prettier-ignore`, `c8`/`v8`/`istanbul ignore`, `@vite-ignore`, `biome-ignore` (whose explanation the tool requires), `@vitest-environment`, `@jsx` pragmas, `@type {...}`, triple-slash references, `__PURE__`, `/* global a, b */`, `$FlowFixMe`, webpack magic comments, MySQL versioned comments (`/*!40101 ... */`), and license headers that carry license text (`Permission is hereby granted`, `Licensed under the`, `SPDX-License-Identifier` and similar). An `@license`, `@preserve` or `Copyright` line passes on its own, but any other line in that comment is judged. Only the directive itself passes: any text after it on the line, including a reason after ` -- `, and any other line in the same comment is judged like any other comment.
- Conditional comments in HTML (`<!--[if IE]>`). A `//` that follows a colon, as in `http://`, is not a comment.

## How to use it

- First run in a repo that already has comments: write the baseline and commit it.
- Never rewrite the baseline to turn a failing check green. Lower it by deleting comments; a local run does the rest.
- Before deleting comments in bulk, search for tool directives. Removing one silently disables a lint rule or breaks a build.
- Reasoning that was in a comment belongs in the commit message or the project's docs. If a comment was guarding something ("unverified, do not render"), move the guard: record it in the docs and remove the hazard from the code, so deleting the warning does not leave the trap.
- When writing code, do not write the comment in the first place. The check exists to catch mistakes, and code that passes because nothing needed removing is the goal.

## In CI

The script has no dependencies and needs Node 18 or later. Copy it into the repository and run it as a CI step or pre-commit hook:

```
node scripts/check-comments.mjs --root .
```
