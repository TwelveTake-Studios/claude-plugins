---
name: guard-check
description: Prove that a check can actually fail by breaking what it watches and confirming it goes red and names the offender. Use after writing or changing a lint rule, test, CI gate, pre-commit hook, monitoring alert, log-based ban rule or scanner, and whenever a check reports a clean or suspiciously convenient result.
---

# Prove the guard fails

A check that has never failed is a check that has not been tested. Guards break in the flattering direction: a broken one reports clean, and a clean report is the result nobody investigates.

## Procedure

1. Break the thing the guard watches, deliberately and minimally: add the forbidden pattern, drop the required value, replay the bad log line.
2. Run the guard.
3. Confirm it fails and names the offender: the file and line, the rule, the host or the account.
4. Restore what you broke.
5. Run it again and confirm it passes.

If step 3 does not name the offender, the guard will not be actionable when it fires for real. Fix that as part of the same change.

## Test what must not match

A pattern can be broken by matching too much as easily as too little. Feed it the cases that must pass as well as the ones that must fail: a successful login must not match a failed-login rule, and a section label must not trip a comment check.

## How guards fail quietly

A zero from a check is only evidence when the check could have produced something other than zero. Common ways it cannot:

- The pattern contains a literal control character where an escape was intended, such as a backspace byte in place of the two characters of `\b`, so it never matches anything.
- The search pattern starts with `-`, so `grep` reads it as an option, prints a usage error and exits 2, and a wrapper that only counts output lines reports zero hits. Use `grep -e`, and make the next step depend on the exit status.
- The checker crashes on every call while the script around it prints success.
- A rule that watches a log is pointed at an empty, rotated or wrong file. Its status summary still shows old totals. Ask the tool what file it is actually reading.
- A detection rule reports zero matches against the real log because the event has never happened. A correct rule and a broken one look identical until you feed both synthetic lines in the exact log format, timestamp included.
- The checker excludes the very files it is meant to count.
- Quoting is lost between shells, for example a pattern passed through `sh -c "..."` inside a container exec, so the search looks for a string that cannot exist. Search for one string you know is present before trusting a sweep that finds nothing.

## What deserves a guard

Failures that are invisible in normal use: a build transform that stops matching while the page still renders, a rewrite that silently drops a number, links into renamed content, gaps in reference numbering, a backup that has never been restored. Anything that breaks visibly on first run does not need one.

## A guard must not pin bad content in place

A test that asserts a specific sentence is present will fail whoever removes it later, and argues for keeping it. When text is cut deliberately, search the test suite for it in the same change.
