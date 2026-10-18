# TwelveTake Studios plugins for Claude Code

Five plugins for checking AI-written work before it ships: the prose, the code comments, the runbooks Claude reads before risky work, the bugs it finds along the way, and the audits themselves.

## Install

Add the marketplace once:

```
/plugin marketplace add TwelveTake-Studios/claude-plugins
```

Then install the plugins you want:

```
/plugin install content-audit@twelvetake
/plugin install ratchet@twelvetake
/plugin install required-reading@twelvetake
/plugin install audit-hygiene@twelvetake
/plugin install found-bugs@twelvetake
```

## The plugins

| Plugin | What it does |
|---|---|
| [content-audit](plugins/content-audit) | A method for auditing AI-written prose: claims that are wrong, citations that do not support the sentence they sit under, studies whose subjects are nothing like the reader, sentences lifted from the source, and generated voice. |
| [ratchet](plugins/ratchet) | Two dependency-free checks that fail when a file gets worse. `check-comments` allows only short section labels in code. `check-sources` fails Markdown that states a price, percentage, count or version with no source. Both keep a baseline, so existing debt does not block work and new debt fails at once. |
| [required-reading](plugins/required-reading) | A hook that blocks commands and edits matching your patterns until the runbooks, checklists or incident reports you name have been read in full in the current session. |
| [audit-hygiene](plugins/audit-hygiene) | A register of findings already ruled on, checked before any audit reports, so settled items stop coming back. Plus a procedure for proving a check can fail before trusting a clean result. |
| [found-bugs](plugins/found-bugs) | Claude fixes or specifically reports every bug it comes across. A Stop hook sends it back when its final message leaves one because it is pre-existing or unrelated to the change. |

`ratchet`, `required-reading` and `found-bugs` need Node 18 or later on the PATH.

## Tests

```
npm test
```

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Every plugin folder carries its own copy of both.
