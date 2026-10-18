---
name: known-issues
description: Keep a register of findings that have already been ruled on, and check it before reporting any finding so that settled items are not raised again. Use before reporting the results of an audit, code review, security sweep, scanner run or subagent analysis, and whenever the user accepts, rejects or explains away a finding.
---

# Known issues register

An audit that re-reports a finding someone has already ruled on is worse than one that misses it. It spends the reader's attention on a settled decision, and it makes the rest of the report harder to trust. The register records what has been decided, so every later review can filter against it.

## Finding the register

More than one register can apply. Check all of them, in this order:

1. `KNOWN-ISSUES.md` in the current working directory, then at the repository root.
2. A register that the project's CLAUDE.md or docs point to.
3. A register named in the user's own instructions. It applies in addition to the project's register, never in place of it.

If there is none and a finding gets ruled on, create one at the repository root from `references/register-template.md` and tell the user where it is.

## Before reporting any finding

1. Search the register for the subsystem and the symptom, not only the exact wording. A scanner and a reviewer describe the same thing differently.
2. If it is listed as accepted, factually wrong, intentional, or a verification trap, do not report it. That includes as a caveat, a footnote, a "worth noting" or a suggested next step.
3. If it is listed as open, report progress if there is any, and do not present it as a new discovery.
4. If an entry's "Reopens if" condition is now true, report the finding and say which condition fired.

Subagent and scanner output gets the same filter before it reaches the user.

## When a finding is ruled on

Add it to the register in the same turn, so the next session does not pay for it again. Each entry has four parts:

- Flagged as: the wording a scanner or reviewer will actually use, so a later search finds the entry.
- Ruling: accepted, wrong, intentional, or open.
- Decided by: who decided and when, with the decision stated plainly; or "verified" with the date and the method.
- Reopens if: the condition that makes the finding live again.

An entry without a "Reopens if" is a permanent blind spot. If genuinely nothing would reopen it, write "nothing" and say why.

## Sections

| Section | Holds |
|---|---|
| A. Accepted | Real, understood, and deliberately left alone. |
| B. Factually wrong | Findings audits keep producing that were checked and are false. Reporting one again is a correctness error. |
| C. Intentional | Looks like a defect or a policy breach, and is a decision. |
| D. Verification traps | Checks that report a false failure. When a sweep reports one, the check is wrong, not the system. |
| E. Open | Real, tracked, not yet fixed. Report progress, not discovery. |

An example entry for section D:

```
### "World-writable .env file (mode 777)"

- Flagged as: insecure permissions, mode 777 on .env
- Ruling: wrong. The .env is a symlink; a symlink's own mode is always 777 and means nothing.
- Decided by: verified 2026-03-02 with `stat -L` on the target, which is 600.
- Reopens if: the target file itself is group- or world-readable.
```

## Keeping it trustworthy

- An entry that rests on a checkable fact (a repository is private, a port is closed, a value is scaled) says how it was verified. When the fact matters, re-check it at the source rather than carrying it forward from the note. A register that says "these repositories are private" when some are public does more harm than no register.
- An entry records a decision. It does not supply a reason the decider never gave. If an inference was written up as someone's rationale, correct the entry.
- Entries can be wrong. If evidence contradicts one, report that plainly, with the evidence, and update the entry once the user rules.
