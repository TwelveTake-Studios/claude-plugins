---
name: check-sources
description: Fail Markdown documents that state a price, percentage, large count or version number without saying where it came from. Use for specs, plans, research notes and READMEs where a measured figure and a guess must be told apart, or when the user asks to run or set up a source check or baseline.
---

# Source ratchet

A figure that came out of a command and a figure that was guessed look identical on the page. `scripts/check-sources.mjs` fails any Markdown line that states a figure without saying where it came from.

A line passes when it, or the paragraph it sits in, carries one of:

- a URL, with or without `https://` (`example.com/pricing` counts),
- a date in `YYYY-MM-DD` form,
- a marker word: verified, measured, tested, confirmed, read from, per the, source:, assumption, assumed, unconfirmed, estimate, guess, not established, unknown, approx.

Figures it looks for: amounts of money in dollars, euros or pounds; percentages; numbers written with a thousands separator; and three-part version numbers. Bare integers are ignored, because model numbers and years are not claims. Inline code, tables, headings, blockquotes, checklist items (`- [ ]`, `- [x]`) and fenced code are skipped.

It ratchets like the comment check. `.source-baseline.json` at the scan root records how many unsourced figures each file already has, and the check fails only when a file goes above its count. When a file improves, a local run lowers its entry automatically; commit the updated baseline. In CI (`--ci` or a `CI` environment variable) the baseline is never rewritten, and a baseline that should have gone down fails the check.

## Running it

```
node "${CLAUDE_SKILL_DIR}/scripts/check-sources.mjs" --root docs
```

| Option | Effect |
|---|---|
| `--root <dir>` | Directory to scan, recursively, for `.md` files. Defaults to the current directory. Hidden directories, `node_modules` and symbolic links are skipped. |
| `--write-baseline` | Record the current counts in `<root>/.source-baseline.json` and exit. |
| `--report` | After the check, list the 20 files with the most unsourced figures. |

| Exit code | Meaning |
|---|---|
| 0 | No file went above its baseline. |
| 1 | At least one file regressed, or in CI the baseline is stale. Each regressed file is printed with up to eight offending lines. |
| 2 | The check could not run: the root is missing or not a directory, `--root` has no value, or the baseline file is unreadable. |

## Fixing a failure

Add where the figure came from: the URL, the command and date, or the document it was read from. If it was not checked, say so with "estimate" or "assumption". Adding a marker word to a figure nobody checked defeats the check; mark it honestly or verify it.

## In CI

The script has no dependencies and needs Node 18 or later. Copy it into the repository and run it against the docs folder as a CI step or pre-commit hook.
