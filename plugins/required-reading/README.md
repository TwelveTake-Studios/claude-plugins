# required-reading

A hook that makes Claude read the right document before working in a risky area. You list patterns and the files that go with them. When a Bash, PowerShell, Edit, MultiEdit, Write or NotebookEdit call matches a pattern, it is blocked until every one of those files has been read in full with the Read tool in the current session.

A file counts as read when every non-blank line of its current contents has been returned by the Read tool. Reading it in parts counts; reading the first page does not. If the file changes, the changed lines have to be read again, and the block message says which lines those are. Subagents read for themselves, and compacting the conversation resets what has been read.

Project rules can only name documents inside the project, so a cloned repository cannot make Claude read its `.env` or files elsewhere on the machine. Personal rules in `~/.claude` can name any file.

## Install

```
/plugin install required-reading --marketplace TwelveTake-Studios/claude-plugins
```

## Setup

Create `.claude/required-reading.json` in the project, or `~/.claude/required-reading.json` for rules that apply everywhere:

```json
{
  "rules": [
    {
      "name": "deploys",
      "match": "\\bdeploy|\\brsync\\b|git push",
      "read": ["docs/RELEASE-CHECKLIST.md"],
      "note": "Compare the server with the local build before deploying."
    }
  ],
  "always": ["docs/KNOWN-ISSUES.md"]
}
```

Ask Claude to set up required reading and the `required-reading` skill walks through the format, writing patterns that do not misfire, and proving a new rule blocks what it should. Without a config file the hook does nothing.

Needs Node 18 or later on the PATH.
