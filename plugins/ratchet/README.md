# ratchet

Two checks that fail when a file gets worse than it was. Each keeps a baseline of what a repository already has, so existing debt does not block work, new debt fails immediately, and the baseline only goes down.

| Skill | Fails when |
|---|---|
| `check-comments` | A source file gains a comment other than a short section label. Explanations, history, status notes and TODOs all count. Tool directives such as `eslint-disable` pass. |
| `check-sources` | A Markdown file states a price, percentage, number with a thousands separator, or version number, and neither the line nor its paragraph says where it came from. |

## Install

```
/plugin install ratchet --marketplace TwelveTake-Studios/claude-plugins
```

## Use

Ask Claude to run either check, or invoke `/ratchet:check-comments` or `/ratchet:check-sources`. Each script runs on its own as well:

```
node skills/check-comments/scripts/check-comments.mjs --root .
node skills/check-sources/scripts/check-sources.mjs --root docs
```

`--write-baseline` records the current counts; commit the baseline file it writes. When a file improves, the check lowers its entry on its own; commit that too. `--report` lists the worst files. Exit code 1 means a file regressed, and 2 means the check could not run, such as a mistyped `--root`. Both scripts have no dependencies and need Node 18 or later, so either can be copied into a repository and run in CI or a pre-commit hook.
