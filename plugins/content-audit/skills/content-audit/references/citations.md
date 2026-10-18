# Citation defects

Five ways a citation fails, ranked by how hard each is to catch. Only the first can be found with a search.

1. Declared and attached to nothing. The document lists real sources, and no sentence refers to any of them. If the page renders a References section anyway, the reader sees real sources under unsupported claims and reasonably concludes the claims are sourced.
2. Attached to a claim the source does not make. The sentence says the research shows something the cited study never measured. It is worse when the sentence adds certainty on top ("the research is clear").
3. The right source, the wrong half of the finding. The text uses one result and omits the one that matters to this reader. A study whose headline finding is that slower participants were affected more gets cited for "held true across ability levels."
4. The wrong source entirely. Right author, adjacent topic, plausible title, correct journal, and it never examined the claim. Often the study that did test the claim exists, by the same group, and is not cited. Only the abstract exposes this one.
5. Decorative. A real source the text makes no claim from. Remove it. It inflates apparent rigor, and it does the most damage when it sits under a sentence that is being honest about uncertainty.

## Checking one citation

1. Resolve the source.
   - PubMed returns an abstract directly: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=<PMID>&retmode=xml`
   - Crossref resolves a DOI to its title, authors and journal: `https://api.crossref.org/works/<DOI>`
2. Read the abstract's conclusion, not the title. The title is what made the citation look apt.
3. Ask whether it supports the specific sentence, or only the topic.
4. Check the numbers against the source: sample size, effect sizes, correlations, thresholds.
5. Check whether the source's most useful finding is the one being used.
6. Check who was studied, and whether the document says so. See below.

A quoted-title search that returns nothing is not evidence of fabrication. Titles get paraphrased, truncated and translated. Search unquoted, and by author and year, before calling a citation fake.

## Who was studied

A citation can be real, correctly attached and accurately quoted, and still be wrong for the reader, because the people in the study are nothing like them. This check is the easiest to skip and the hardest to unsee once you have done it.

An example of the pattern: a page for recreational athletes calls a training rule "about as settled as the science gets" and cites a review. The review is descriptive. It reports what elite competitors training ten or more times a week already do, and its subjects train three times as often as the page's reader. The one randomized trial in the reader's own population found both groups improved, with no significant difference between them; a positive result appeared only in a subgroup analyzed after the fact, and the page reported the subgroup as the finding.

Ask three questions of every citation:

- Who was in it? Elite, trained, novice, sedentary, clinical, animal?
- How much did they do? A ratio derived from ten sessions a week does not divide into three. Percentages hide this; absolute counts expose it.
- Was it descriptive or experimental? "This is what the best performers do" and "this was tested against an alternative" are different claims, and popular writing collapses them constantly.

The fix is transparency. If it is the best evidence available and there is no reason to distrust it, use it and say what it rests on. What the page may not do is call it validated when it is not.

This is worth sweeping for across a corpus as well as checking page by page. Fetch every citation's abstract, flag the ones whose subjects are elite-only, clinical-only or animal, and read those pages. One review cited across several pages carries its population problem into all of them. Expect false positives: a keyword sweep will also flag pages that already name the population correctly. The sweep produces a reading list, not a verdict.
