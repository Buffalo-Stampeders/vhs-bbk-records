# VHS Boys Basketball Record Book

Searchable, auto-updating record book for The Villages High School boys basketball (2005–present).

**Live page:** https://buffalo-stampeders.github.io/vhs-bbk-records/

## How it works

- `index.html` — the whole page (record-book baseline and the records engine are embedded at build time).
- `data/records_baseline.json` — every entry from the official record book (`RECORD BOOK_VHS Boys Basketball_Updated 3.14.2026.docx`), parsed by `src/parse_record_book.py`.
- `data/seasons/<season>.json` — per-season stats pulled from MaxPreps (player totals, game log, box scores). Seasons marked `"baseline": true` are already in the record book and are only used for career sums.
- `data/seasons/index.json` — list of season files the page should load.
- `data/config.json` — `bookThrough` (last season in the record book), head coach, district-tournament cutoff date, and `opponentAliases` (MaxPreps name → record-book name).
- `sync/maxpreps_scrape.js` — runs in a browser tab on maxpreps.com and produces a season JSON.
- `sync/records_engine.js` — decides which live stats qualify for each record list (same thresholds as the book) and merges them in.

During the season (Nov 1 – Apr 1) a scheduled Claude task runs the scraper every morning, commits `data/seasons/<current season>.json`, and the page picks it up on the next load. Entries that came from MaxPreps show a **Live** chip. **Manual categories (never filled from MaxPreps):** District Wins, District Tournament Wins, State Tournament Games, District/Region championships and the coaching championship/playoff lists — Marty updates these in `data/records_baseline.json` (or tells Claude) at season end. Where the book and MaxPreps disagree on a historical value, the book value stands (MaxPreps history is known to be inaccurate).

## Embedding on athletics.tvcs.org

```html
<iframe src="https://buffalo-stampeders.github.io/vhs-bbk-records/" style="width:100%;min-height:1400px;border:0" loading="lazy" title="VHS Boys Basketball Record Book"></iframe>
```

## Updating the baseline (new record-book revision)

1. Replace the .docx and run `python3 src/parse_record_book.py "<docx>" data/records_baseline.json`.
2. Set `bookThrough` in `data/config.json` to the last season the book covers and mark that season's file `"baseline": true`.
3. `python3 src/build.py` and commit.

## MaxPreps history fill (Oct 29, 2026)

`src/fill_history.py` compared every MaxPreps season (2005-06 → 2025-26, saved under `data/history/`) against the record book and added the entries the book was missing — 119 in all — plus two season-label fixes. It only adds; where MaxPreps disagrees with a value already in the book, the book is kept and the difference is listed in `docs/maxpreps-history-fill.md` for review. Seasons with incomplete MaxPreps stats (2005-06, 2006-07, 2007-08, 2008-09, 2009-10, 2014-15, 2015-16, 2016-17) contributed single-game lines only.

**Two different "First Academy" schools:** The First Academy (Orlando) Royals and First Academy (Leesburg) Eagles are separate opponents and their all-time records are kept separate. MaxPreps lists them as "The First Academy" and "First Academy" respectively; `data/config.json` maps each to its own book name, and opponent matching keeps parenthetical qualifiers so they can never merge.

**Full-depth lists (10/29/2026):** every category now contains every non-zero MaxPreps value, not just entries above the printed book's cutoff (`FILL_ALL=1 src/fill_history.py`). Rate categories still require their minimum attempts (FG% 100 FGA, 3P% 20 3PA, FT% 20 FTA) and averages need at least 10 games and half the team's games; no rates are taken from partially-covered seasons. The page shows the top 100 of each list with a "Show all" button.
