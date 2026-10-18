---
name: content-audit
description: Audit AI-written prose for claims that are wrong, citations that do not support the sentence they are attached to, sentences copied from the cited source, and generated voice. Use when fact-checking or reviewing articles, documentation, knowledge-base entries, lessons or site copy that an AI drafted, and before publishing AI-drafted content.
---

# Content audit

A language model writes the most probable next sentence. In a technical subject the most probable sentence is often the popular wrong one, and it reads exactly as fluently as a correct one. Treat confident, uncited prose as the highest-risk text on the page.

Read every document yourself, whole. Subagents can fetch sources, but the judgment in this audit depends on reading the document in full, and a summary hides the defects it looks for.

## Order of work

1. Measure, then check the measurement.
2. Ask whether each claim belongs on the page at all.
3. Check every citation. Details: `references/citations.md`.
4. Check for sentences taken from the source. Details: `references/copied-sentences.md`.
5. Hunt confident uncited claims.
6. Fix the voice.
7. Read the rendered page.
8. Ask what is missing.
9. Guard the fixes, and search for each fix across the whole corpus.

## 1. Measure, then check the measurement

Before fixing a pattern across many documents, count it, then check a sample of the hits by hand. Counts of surface patterns are inflated by legitimate uses: a bold label is correct at the head of each item in a list of factors, and "actually" often marks a real contrast.

Distrust a convenient result. A checker that reports zero problems across a large corpus is more likely broken than right. Plant a known defect and confirm the checker finds it before trusting a clean run.

## 2. Ask whether a claim belongs

Accuracy is not the test for publication. Before spending effort verifying a claim, ask:

- Would a reader of this page have come here for this?
- Is it internal detail (a constant, a setting, an implementation choice) presented as a finding?
- Does it belong to the page's subject, or to an adjacent topic that crept in?
- If it is a position rather than a fact, is it answering a question someone asked?

A claim that fails these needs deleting, and a better citation will not save it. A guide to choosing a home printer that opens with a statistic about global paper consumption still has no reason to open that way once the statistic is corrected.

## 3. Citations

Five ways a citation fails, a procedure for checking one, and the check for who was studied are in `references/citations.md`. Read it before the citation pass.

## 4. The source's own sentences

A sentence can be correct, correctly cited, and copied. How to find and fix that is in `references/copied-sentences.md`. Read it before rewriting anything that was drafted from a single source.

This applies to the audit's own fixes. When a claim is corrected to match what the source says, write the correction in your own words; pasting the source's sentence in its place trades one defect for another.

## 5. Confident uncited claims

Citations are usually attached to a claim that already sounded plausible, so cited sentences have at least been anchored to something. Uncited assertions have not. Look for:

- A specific threshold or figure with no source.
- Superseded findings stated as current. Popular writing keeps old explanations alive long after the research moved on, and the model learned from the popular writing.
- Absolutes on subjects that need hedging.
- Internal contradictions. They are the cheapest defect to find and the strongest sign the text was assembled from parts.
- A number that is right for a different case: guidance correct for one range, audience or duration, applied to another.

When a number is unsupported, find the correct one and use it. Deleting it leaves the reader with less.

When a claim is true in general and wrong for this page's subject, keep both halves. Give the usual answer, say why it does not apply here, and give the one that does. A curious reader wants the complete answer, and removing the general claim throws away a true fact.

## 6. Voice

Fix what reads as generated:

- Paragraph after paragraph opening with a bolded label. Rewrite as prose, or make it a real list if it is one.
- Lists disguised as paragraphs.
- Condescension: telling readers they are doing it wrong, or explaining what an adult already knows.
- Internal vocabulary: UI names, spec terms and code identifiers the reader has never seen.
- Bare academic citations in body copy, like "(Smith, 2021)". Describe the evidence instead: "in a study of more than five thousand adults".
- Repeated sentence templates, one-line slogan openers, closers that restate the heading, and "it is not X, it is Y" contrasts.

Do not strip mechanically. Legitimate list labels, and words like "actually" that mark a real contrast, are not defects.

## 7. Read it rendered

Open the built page in a browser. Source review misses:

- Markup that renders wrong, such as two citation formats where one becomes a superscript and the other prints literal brackets.
- Spelling and dialect drift, which is invisible in a diff and obvious in a paragraph.
- Dangling headings, empty states and sections whose content was filtered away.
- How much of the page is the content being audited.

## 8. Ask what is missing

Checking what a document says will not find what it leaves out. An article on why wrist heart-rate sensors misread can cover cold, motion and skin tone, have every claim verified, and never mention tattoos, which the device makers themselves acknowledge can block the sensor. Nobody who wrote or checked it had a tattoo.

Ask a domain expert what is missing. It is the most valuable question in the audit, and no amount of verification replaces it.

## 9. Guard the fixes

A fix that a later edit or a build step could silently undo needs a check that fails loudly. Guards worth having:

- Substance preservation: compare a rewrite with the committed version and fail when a number, citation marker, URL or heading disappears. It will flag deliberate corrections too, which is intended; record the reason in the commit.
- Build transforms: fail when a build-time transform stops matching. These fail silently, because the page still renders and the feature quietly stops.
- Reference numbering: when references render as an ordered list, the number a reader sees is the list position, so a gap in the ids makes every later marker point at the wrong source.
- Link targets: links into content that is unpublished, gated or renamed.

Prove each guard by breaking what it watches and confirming it fails and names the file.

Then search for each fix across everything. Documents generated from the same wrong summary carry the same error, so a defect found once is rarely alone. Not every match is the defect, though. Record which matches are legitimate, in the commit, so the next pass does not "fix" correct text.

## Order the work by value

Work in the order the reader needs, and resist starting with whatever a script finds worst-written. If the content has a priority field, use it. If not, ask what a reader must be able to find on day one.

Commit one document at a time with the reasoning in the message. A later session needs to know why a number changed, not only that it did.

## Checklist for each document

1. Read the whole thing.
2. Resolve every citation. Confirm it supports the specific sentence, and that the sentence is not the source's own.
3. Verify every number against a source: sample size, thresholds, effect sizes.
4. Verify or cut each confident uncited claim.
5. Check for internal contradictions.
6. Fix the voice without stripping legitimate structure.
7. Delete what does not belong, including whole sections.
8. Run the guards and justify every flag.
9. Check the rendered page.
10. Commit, with the reasoning.
