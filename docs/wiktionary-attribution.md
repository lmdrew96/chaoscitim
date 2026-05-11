# Wiktionary attribution

Tier-3 English glosses on ChaosCitim tokens are sourced from
[en.wiktionary.org](https://en.wiktionary.org/), licensed under
[Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).

This is compatible with the rest of our token data, which inherits
CC BY-NC-SA 4.0 from the UDPipe Romanian-RRT model (see
`docs/analyzer-evaluation.md`). Downstream redistribution of glosses
must preserve both attribution lines.

## How glosses enter the database

`lib/wiktionary.ts` calls the MediaWiki API at `en.wiktionary.org/w/api.php`
during ingestion. For each unique content-word lemma in a text:
1. Pull the page wikitext.
2. Locate the `==Romanian==` section.
3. Find the POS subsection matching the UDPipe UPOS tag.
4. Extract the first `# definition` line; strip wiki markup; compress to
   ≤3 words.

Results land in `text_tokens.gloss_en`. Cached on disk at
`data/glosses-cache.json` (gitignored, regenerable).

## Override hierarchy

Resolution order:
1. **`data/seed-glosses.json`** (committed) — hand-curated overrides for
   the seed library where Wiktionary's first definition isn't the best
   reading in context.
2. **`data/glosses-cache.json`** (gitignored) — disk cache. Missed lemmas
   are cached as `null` to prevent re-fetching known misses.
3. **Live Wiktionary fetch.**

## Surfacing attribution to readers

Per CC BY-SA, the reader UI must include a Wiktionary attribution line
when tier-3 glosses are displayed. Recommended placement: footer of the
read view or a help-popup adjacent to the gloss panel.

```
Tier-3 English glosses adapted from en.wiktionary.org (CC BY-SA 4.0).
```
