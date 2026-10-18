---
name: required-reading
description: Set up or change required-reading rules, which block commands and file edits matching a pattern until named files have been read in full in the current session. Use when the user wants Claude made to read a runbook, incident report, checklist or policy before working in a risky area such as deploys, migrations, payments or production hosts, or when a required-reading block needs explaining.
---

# Required reading

This plugin's hook checks every Bash, PowerShell, Edit, MultiEdit, Write and NotebookEdit call against patterns in a `required-reading.json` file. When a call matches, it is blocked until every file named for that rule has been read in full with the Read tool. Advisory reminders get read past; a blocked call cannot be.

A file counts as read when every non-blank line of its current contents has been returned by the Read tool. Reading it in several parts counts. Reading the first page does not. If the file changes, the changed lines have to be read again, and the block message names them. Reading it through a shell command (`cat`, `Get-Content`) does not count.

Each agent reads for itself: a subagent has to read the file before its own matching calls go through, and a file read by a subagent does not count for the main conversation. When the conversation is compacted or cleared, every file has to be read again.

## Where the rules live

- Project rules: `<project>/.claude/required-reading.json`. Relative paths resolve against the project root. Every path must stay inside the project, name a document (`.md .mdx .markdown .txt .rst .adoc`) and not go through a symbolic link, so a cloned repository cannot make Claude read its `.env` or anything outside it.
- Personal rules: `~/.claude/required-reading.json`. Relative paths resolve against the home directory, and paths may point anywhere.

Both files are loaded when both exist. With neither, the hook does nothing.

## Format

```json
{
  "rules": [
    {
      "name": "deploys",
      "match": "\\bdeploy|\\brsync\\b|git push|npm publish",
      "read": ["docs/RELEASE-CHECKLIST.md"],
      "note": "Compare the server with the local build before deploying."
    },
    {
      "name": "database migrations",
      "match": "prisma migrate|alembic (upgrade|downgrade)|\\bdrop table\\b|db/migrations/",
      "read": ["docs/MIGRATIONS.md"]
    }
  ],
  "always": ["docs/KNOWN-ISSUES.md"]
}
```

| Field | Meaning |
|---|---|
| `rules[].name` | Shown in the block message. |
| `rules[].match` | A JavaScript regular expression. It is tested separately against the command, the file path, and the first 4,000 characters of any new content, so `^` and `$` anchor to each of them. File paths are also tested with backslashes turned into forward slashes, so `db/migrations/` matches on Windows too. Case-insensitive unless `flags` says otherwise. |
| `rules[].flags` | Optional regular-expression flags. Defaults to `"i"`. |
| `rules[].read` | Files that must be read in full before a matching call is allowed. |
| `rules[].note` | Optional. Added to Claude's context once per session, the first time the rule's call is allowed. |
| `always` | Files required whenever any rule matches. |

Backslashes in a JSON string are doubled: the pattern `\bdeploy` is written `"\\bdeploy"`.

## Writing rules that work

- Match the commands, hostnames and paths of the risky area, not words that come up in conversation about it. `\brsync\b` and a server's hostname are good triggers; `server` is not.
- Anchor short tokens with `\b`. Without one, `rsync` also matches `readdirSync` in ordinary JavaScript, and the rule blocks unrelated work.
- Keep patterns simple. A pattern that takes longer than 250 ms to test, or that is reached after all the rules together have used 2 seconds, is reported and treated as matching, so its files must be read before the call goes through.
- Keep the required files current and to the point. Every session in that area has to read all of them.
- After saving a rule, prove it. Run a harmless command that contains the trigger, such as `echo "deploy test"`, and confirm it is blocked and names the file. Read the file in full, run the same command again, and confirm it passes. A rule that has never blocked anything has not been tested.

## Behavior to know

- Creating or editing either `required-reading.json` is never blocked, since the file contains every trigger pattern.
- A rule that names a file that does not exist blocks matching calls with "file not found" until the path is fixed.
- Problems in a config file (invalid JSON, an invalid pattern, a stray backspace character from a JSON escaping slip, or a project path that is outside the project, is not a document, or goes through a symbolic link) are reported once per session in Claude's context, and the broken part is not enforced. A slow pattern is the exception: it is treated as matching.
- Only reads of files that a rule names are recorded. Read state is stored in the plugin's data directory and removed after two weeks.
