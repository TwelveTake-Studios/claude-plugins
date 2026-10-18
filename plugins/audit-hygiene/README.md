# audit-hygiene

Two skills that make audit results worth trusting.

| Skill | Use |
|---|---|
| `known-issues` | Keeps a `KNOWN-ISSUES.md` register of findings that have been ruled on: accepted, factually wrong, intentional, or a check that reports false failures. Every audit, review and scanner result is filtered against it before reporting, and each entry carries a "Reopens if" condition so a settled finding comes back when the facts change. |
| `guard-check` | Proves a lint rule, test, CI gate, alert or scanner can fail: break what it watches, confirm it goes red and names the offender, restore, confirm green. Includes the common ways checks fail quietly and report clean. |

## Install

```
/plugin install audit-hygiene --marketplace TwelveTake-Studios/claude-plugins
```

## Use

Both skills load on their own when an audit is being reported or a check has just been written. They can also be invoked as `/audit-hygiene:known-issues` and `/audit-hygiene:guard-check`. A blank register is in `skills/known-issues/references/register-template.md`.
