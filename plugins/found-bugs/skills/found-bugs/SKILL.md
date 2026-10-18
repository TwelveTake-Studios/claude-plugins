---
name: found-bugs
description: Deal with every bug you come across, however old it is. Fix it, or report it specifically, and never leave it because it is pre-existing or unrelated to the current change. Use whenever a test, build, linter or type check fails, when a defect turns up outside the task at hand, and before writing a final report that mentions any failure.
---

# Found bugs

"Pre-existing", "already failing" and "unrelated to this change" say when a bug arrived. They say nothing about whether it matters, and none of them is a reason to leave it. A user who reads "two tests were already failing" now has a bug, no fix and no detail.

## When you find one

1. Find out what it is. Read the failure, reproduce it, and locate the cause well enough to describe it.
2. Fix it when the fix is clear and it is in the codebase you are working in. Commit it separately from the task's change, with a message that says what was broken, so each diff stays reviewable.
3. Report it specifically when it cannot be fixed here: it needs the user's decision, the fix is risky or large, or it lives in another system or a dependency. Give what it is, where (file and line, command, host), the evidence (the error, the failing input), and what a fix would need.
4. If the project keeps a known-issues register, check it first. A finding already ruled on there stays out of the report.

## Do not

- Wave a failing test through because it failed before your change. If the history matters, run it on the unchanged code to find out, and then deal with it either way.
- Skip, disable or delete a failing test, or loosen an assertion, to get a green run.
- Fold it into a summary line such as "a few unrelated warnings remain". Each one gets its own line and its own detail.
- Treat "out of scope" as a reason not to mention it. Scope decides whether a large fix needs the user's go-ahead first, not whether the user hears about the bug.

## The Stop hook

This plugin also installs a Stop and SubagentStop hook. When Claude's final message describes a problem as pre-existing, already failing, failing on main, or unrelated to the change, and neither that sentence nor the next says it was fixed, the hook sends Claude back: if the problem is in fact already fixed, Claude says so in one line and finishes; otherwise it fixes it or reports it specifically. "Should be fixed later" does not count as fixed. Statements that nothing was found ("No pre-existing failures") and test-first reports ("fails before the change and passes after") are left alone. It fires at most once per turn, and it ignores text inside code.
