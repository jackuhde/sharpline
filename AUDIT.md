# Sharpline audit, Nov 19 2026

## Why the Top List showed about two players (4-game slate, 10:04 AM ET)

| Stage | Count |
|---|---|
| Games with DraftKings props loaded | 4 of 4 |
| Two-sided DraftKings prop markets | 408 (plus 2,813 one-sided milestone lines) |
| Matched to a roster player, game not started | 408 |
| Yes/No markets (double-double etc.) | 52 |
| No usable game log | 14 |
| Priced by the model | 342 |
| Removed for injury questions | 23 |
| Positive EV, raw model | 177 |
| Positive EV after the per-stat accuracy adjustment | 54 |
| At least 2% EV (qualified) | 5 to 6, from 2 players |
| Held by the one-per-player cap | 3 to 4 |
| Shown | 2 |

Root cause, in order of impact:
1. DraftKings is the only book in the free feed, so there is no line shopping. Every edge has to come from the model beating one book's price.
2. The model is only slightly better than DraftKings' price (out-of-sample Brier .2469 vs .2470). After the per-stat adjustment, few props clear 2%.
3. The edges that do clear 2% cluster on a few players, and the model leans Under (330 of 342 tonight). The per-player cap then holds most of them back. That is intended, because one player's props win or lose together.
4. One-sided milestone lines can't be priced without the other side. A pregame snapshot job now saves them so they can be backtested.

The threshold was not lowered and the list was not padded.

## Backtest (17,902 lines, 222 games, each half scored by a model fit on the other half)

- The picked side wins 1 to 2 points less often than the raw model says. This is why only each stat's proven share of the edge is counted.
- Realized ROI by raw EV band:
  - 0 to 2%: −1.1% (n=3,207)
  - 2 to 4%: −5.6% (n=1,362, ±2.7)
  - 4 to 6%: +9.2% (n=514, ±4.4)
  - 6%+: +2.5% (n=118, ±9.2)
- The 2 to 4% band losing argues for a higher minimum. The default stays at 2% until the live log has more data, and the 4% and 6% settings are available.

## What changed

- **Ranking:** Top List ranking is in rank.js (pure functions, 39 tests): EV, de-vig, line conversion, per-player and per-game caps, expert weighting.
- **Coverage report:** every market lands in exactly one bucket, broken out by game, stat, side and book. A slate verdict says whether a short list is a thin slate, a data gap, stale prices or a model fallback.
- **Props tab:**
  - Sort by EV, chance or best odds across all games.
  - Filters for Over, Under or your-book odds.
  - DraftKings price and EV on every row.
  - DraftKings vs your price comparison, including a flag when your book has a different line.
- **Recommendation log (recs.js):**
  - Every Top List pick at a DraftKings price is logged once with line, price, chance, EV, time and model version. Entries are never edited.
  - Graded from box scores, with CLV against DraftKings' close.
  - Breakdowns by stat, chance band, EV band and side. This log is separate from your bets.
- **Tracker:** the model log, prediction accuracy and backtest now render. They never did before, because of a script-timing bug.
- **Expert Check:** the stale hard-coded records are removed. A testable weighting rule replaces them: sample size, ROI vs noise, CLV, recency and consistency, capped at 15%. Every source gets 0% today, because no free feed grades picks at the posted price.
- **EV colors:** one rule everywhere: green at or above your minimum, amber small, red below −1%.

## Limits

- One book. Real line shopping needs a paid odds API (none set up; not added without approval).
- About one month of graded data. Steals and blocks samples are too small to trust.
- NBA only.

## NFL (added Nov 19 2026)

**What the free feeds have.** ESPN's free NFL feeds provide:
- weekly schedule with real game status, bye teams, records, and playoffs
- DraftKings moneyline, spread and total, with opening numbers
- every DraftKings player-prop line: passing, rushing, receiving, kicking, defense, anytime/first/2+ TD
- team totals, halves and quarters
- the injury report with dates
- live and final box scores, including targets
- live situation: possession, down and distance, field position, red zone
- rosters and positions

**What they don't have.** These are all missing, and nothing claims to use them:
- prices on NFL props (lines only)
- live in-game NFL odds
- snap counts, air yards, aDOT, pressure rate, offensive-line grades
- weather

**Model (nfl-model.js).** The projection combines:
- usage, weighted toward recent games
- a shrink toward the posted line when the sample is small
- the opponent's allowance to the player's position, shrunk by games played
- a mild game-script adjustment from the spread and total

It uses lognormal distributions for yards, Poisson for small counts, and normal for volume. A per-stat shrink factor is fitted out of sample.

**Backtest (scripts/nfl-backtest.mjs).** It was run against 7,785 DraftKings prop lines that ESPN kept from 150 games this season. Each game is predicted from earlier games only, and each half of the season is scored by a k fitted on the other half.
- Passing TDs: right side 57.7% of 130 picks.
- Longest rush: 57.4% of 336.
- Rush+rec yards: 60.2% of 133.
- Passing yards, completions, attempts, rushing yards, receiving yards and receptions: no edge (k at or near 0), so they show "No lean".
- Opponent and game-script adjustments made no measurable difference overall. They are kept but labeled.
- Only stats at 54%+ on 100+ picks can reach the NFL Top List.

**Why the NFL Top List needs prices.** No prices means no EV. Picks need a price you enter or scan before they rank. Until then, "Worth price-checking" shows the strongest trusted sides with the fair price.

**Game lines.** These are shown at DraftKings with the no-vig fair chance. There is no team model, so there is no claimed edge.

**Live.** Live uses ESPN's official status. In-game chances for tracked NFL bets come from the box score, time left and the pregame line. They are model only and not yet calibrated.

**Data job.** Every 3 hours, .github/workflows/nfl.yml rebuilds data/nfl and reruns the backtest.
