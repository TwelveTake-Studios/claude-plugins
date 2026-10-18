# Known issues

Findings that have already been ruled on. Every audit, review, security sweep and scanner run checks this file before reporting, and leaves out anything listed in sections A to D.

Every entry carries a "Reopens if" condition. When that condition is met, the finding is live again and should be reported.

## How to use this

1. Search this file for the subsystem and the symptom.
2. Listed under A, B, C or D: do not report it.
3. Listed under E: report progress, not discovery.
4. Its "Reopens if" condition is now true: report it, and say which condition fired.

When a finding is newly ruled on, add it here in the same change.

## A. Accepted, will not fix

## B. Findings that are factually wrong

## C. Intentional by design

## D. Verification traps

| Symptom reported | What is actually true |
|---|---|

## E. Open and tracked

| Item | State |
|---|---|

## Adding an entry

```
### <what an audit will call it>

- Flagged as: the wording a scanner or reviewer will actually use
- Ruling: accepted / wrong / intentional / open
- Decided by: <who>, <date>, with the decision in plain words; or "verified <date>" and the method
- Reopens if: the condition that makes this live again
```
