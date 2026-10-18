# found-bugs

Claude deals with every bug it comes across, however old. A bug in the codebase being worked on gets fixed in its own commit when the fix is clear. Anything that needs a decision or lives elsewhere gets reported specifically: what, where, and the evidence. "Pre-existing" and "unrelated to my change" stop being the end of the conversation.

The plugin has two parts:

| Part | What it does |
|---|---|
| `found-bugs` skill | The rule and the procedure: find out what it is, fix it or report it, and never pass a failing test, disable it or fold it into a summary line. |
| Stop hook | When Claude's final message, or a subagent's, leaves a problem because it is pre-existing, already failing, or unrelated to the change, the hook sends it back once to fix it or report it properly. |

## Install

```
/plugin install found-bugs --marketplace TwelveTake-Studios/claude-plugins
```

When the hook sends Claude back, Claude Code shows "Stop hook error occurred" and the hook's message. That is how Claude Code labels any Stop hook that continues the turn; nothing has failed.

Needs Node 18 or later on the PATH. It works alongside the `known-issues` skill in `audit-hygiene`: findings already ruled on in the register stay out of reports.
