# content-audit

A method for auditing prose that an AI drafted: articles, documentation, knowledge-base entries, lessons and site copy.

Fluent, confident, uncited text is the highest-risk text on an AI-drafted page. The skill works through it in order: whether each claim belongs on the page at all, whether each citation supports the specific sentence it is attached to, who the cited studies were done on, whether sentences were lifted from the source, which confident claims have no source, and what the page leaves out.

## Install

```
/plugin install content-audit --marketplace TwelveTake-Studios/claude-plugins
```

## Use

Ask Claude to audit or fact-check a document, or run `/content-audit:content-audit` with the file or folder.

## Contents

- `skills/content-audit/SKILL.md`: the procedure and the checklist for each document.
- `skills/content-audit/references/citations.md`: five ways a citation fails, how to check one, and the check for who was studied.
- `skills/content-audit/references/copied-sentences.md`: finding and rewriting sentences, examples and analogies taken from a source.
