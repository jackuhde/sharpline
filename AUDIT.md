# NBA prop model bias audit, Nov 22 2026

Reproduce: `node scripts/props-model/audit.mjs` (writes data/nba/audit.json). Every number below comes from that script on 19,293 graded DraftKings lines this season, using pre-game information only.

## What the app was doing

With the model.json deployed before this audit, 84.8% of priced markets were pushed toward the Under and 96.2% of 2%+ EV picks were Unders (126 of 131).

## Root cause

1. **A season-wide intercept.** The model had a constant term (b0 = -0.111) that lowered every Over by about 2.7 points for every player and stat. It was learned mostly from the first two weeks, when Overs won 46% against 49.5% priced. That gap has been closing:

| Week of | Lines | Overs won | DraftKings priced Overs |
|---|---|---|---|
| 2026-10-26 | 4554 | 46.1% | 49.4% |
| 2026-11-02 | 5454 | 46.9% | 49.5% |
| 2026-11-09 | 5308 | 48.9% | 49.4% |
| 2026-11-16 | 3948 | 48.9% | 49.6% |

   Fit on earlier weeks only, the old model moved the average prop toward the Under by 1.84 pts (week of 2026-11-09) and 1.03 pts (week of 2026-11-16), while Overs actually ran 0.54 and 0.61 points below DraftKings' price. The push was 2 to 3 times too big.

2. **A floor on the per-stat accuracy share (k).** k is the share of the model's move away from DraftKings that showed up in later results. The old rule pulled k toward 0.8 and never let it go below 0.3, so stats where the model's moves lost out of sample (3-Pointers raw k -0.463, Blocks -0.812) still counted 30% of the move.

3. **The same push on every market of one player.** The intercept, the combo and back-to-back terms and the player's recent hit rate are identical across Points, Pts+Reb, Pts+Ast, Pts+Reb+Ast and Reb+Ast. When DraftKings prices a player near 50/50 on all of them, they all clear the bar as Unders at once. Example, Nov 9, model fit on earlier weeks:

| Cooper Flagg prop | DraftKings no-vig Over | Model Over | Pick | Result |
|---|---|---|---|---|
| Pts+Reb 32.5 | 51% | 45.7% | Under, 3.7% EV | 53 (lost) |
| Points 25.5 | 49.3% | 44.3% | Under, 3.6% EV | 43 (lost) |
| Pts+Reb+Ast 40.5 | 48.4% | 43.6% | Under, 2.6% EV | 59 (lost) |
| Reb+Ast 14.5 | 48.7% | 44.1% | Under, 2.1% EV | 16 (lost) |

   Each one got the same push in log-odds: intercept -0.11, back-to-back -0.08, combo -0.05, his own numbers about 0. Four correlated Unders in one game, all lost. Across the two test weeks the old rules picked against Flagg 4 times, all Unders, 0 won.

4. **The projections do not underestimate players.** DraftKings' lines are close to unbiased on the mean (line minus actual -0.04). Season averages run 0.26 below what players scored and the app's projection 0.17 below, so if anything the inputs lean low, not the outputs. Overs still lose slightly more than priced because these stats are skewed: a few big games lift the average above the typical game.

| Stat | Lines | Overs won | Priced | Line minus actual | Season avg minus actual | App projection minus actual |
|---|---|---|---|---|---|---|
| Points | 2689 | 47.7% | 50% | -0.14 | -0.4 | -0.29 |
| Assists | 1969 | 48.8% | 49.3% | -0.12 | -0.1 | -0.15 |
| Rebounds | 2504 | 47.8% | 49.1% | -0.09 | -0.04 | -0.12 |
| 3-Pointers | 2170 | 49% | 47.9% | -0.16 | -0.09 | -0.07 |
| Steals | 840 | 43.8% | 48.8% | -0.01 | 0.15 | 0.12 |
| Blocks | 406 | 44.1% | 47.4% | -0.04 | 0.14 | 0.11 |
| Pts+Ast | 2048 | 48% | 49.9% | 0 | -0.55 | -0.3 |
| Pts+Reb | 2534 | 46.9% | 50% | 0.04 | -0.4 | -0.21 |
| Reb+Ast | 2017 | 48.7% | 49.8% | -0.06 | -0.13 | -0.13 |
| Pts+Reb+Ast | 2116 | 46.7% | 50% | 0.18 | -0.56 | -0.21 |

## Correction

- **Intercept removed** (b0 fixed at 0). Out-of-sample log loss was the same without it, so it carried no tested information, only the early-season lean.
- **k shrunk toward the market with no floor**: k = sum(result gap × model move) / (sum(model move²) + 0.5), kept between 0 and 1, estimated walk-forward. A stat with k = 0 is priced at DraftKings' no-vig chance.

| Stat | Raw k (walk-forward) | Old k | New k |
|---|---|---|---|
| Points | -0.106 | 0.735 | 0 |
| Assists | 0.457 | 0.482 | 0.192 |
| Rebounds | -0.856 | 0.621 | 0 |
| 3-Pointers | -0.463 | 0.3 | 0 |
| Steals | 1.501 | 1 | 0.703 |
| Blocks | -0.812 | 0.3 | 0 |
| Pts+Ast | 0.184 | 0.744 | 0.152 |
| Pts+Reb | 0.658 | 0.755 | 0.564 |
| Reb+Ast | 0.243 | 0.502 | 0.197 |
| Pts+Reb+Ast | 0.633 | 0.865 | 0.525 |

- **Top List groups overlapping stats.** Two props on one player that share a box-score stat (Points with Pts+Reb, 3-Pointers with Points, any two combos) are never both listed. The stronger is kept and the other is held as "same player and same stat". A second prop on a player is allowed only if it shares no stat with the first and, on the default setting, is exceptional (5%+ EV, High confidence).
- **Side balance check** in "How tonight's slate was evaluated": markets leaning Over / Under, qualified Overs / Unders, any player with 3+ qualified props, and last week's actual Over rate. It flags; it changes nothing.
- Nothing forces Overs or a split, and the 2% minimum EV is unchanged.

## Validation

Walk-forward: weeks of 2026-11-09 and 2026-11-16, each priced by a model and k fit only on earlier weeks.

| | Before | After | DraftKings alone |
|---|---|---|---|
| Brier score | 0.2468 | 0.2465 | 0.2465 |
| Log loss | 0.6866 | 0.6861 | 0.686 |
| Average move vs DraftKings, by week | -1.84, -1.03 pts | -0.84, -0.4 pts | actual: -0.54, -0.61 pts |
| Markets leaning Under / Over | 88.4% / 11.6% | 61% / 11.4% | |
| Leaning-Under markets, predicted vs actual Under | 51.9% vs 50.4% | 51.4% vs 50% | 49.9% |
| 2%+ EV picks | 121 (121 Under), 54.5% won, ROI 2.9% | 7 (7 Under), 57.1% won, ROI 5.8% | |
| 2 to 4% EV band | 96 picks, ROI -7.8% | 7 picks, ROI 5.8% | |
| Top Lists with a player twice | 1 of 7, 1 overlapping pair | 0 of 3, 0 overlapping | |

Before any k, the model's own 2%+ EV picks, each week priced by a fit on earlier weeks: week of 2026-11-02, 960 picks, ROI -3.5%; week of 2026-11-09, 677 picks, ROI -11.4%; week of 2026-11-16, 176 picks, ROI -4.9%. Unadjusted, it lost money every week.

The old rules' 25 picks at 4 to 6% EV in the test weeks won 19 (76%). That is 25 correlated bets in two weeks, mostly Unders on the same few players, and it is not repeatable evidence: the much larger 2 to 4% band lost 7.8%.

## What this means

- The Under tilt came mostly from a constant learned in two weeks, plus a k rule that could not go below 0.3. Both are fixed, and the model's remaining average move toward the Under now matches what actually happened.
- Out of sample the model is about as accurate as DraftKings' own price, not better (log loss 0.6861 vs 0.686). With DraftKings as the only free price feed, expect very few NBA prop picks: 7 across the two test weeks. An empty list on a small slate is the correct output. Real edges need a better price at another book (enter or scan the Fliff price).
- The 7 picks that remain are too few to judge and are not evidence of an edge.

---

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
- Correction: the first backtest had no closing spreads or totals saved for past games, so game script was never actually tested. With real closing lines (added Nov 19), opponent + game script is the biggest gain in the model; see below.
- Only stats at 54%+ on 100+ picks can reach the NFL Top List.

**Why the NFL Top List needs prices.** No prices means no EV. Picks need a price you enter or scan before they rank. Until then, "Worth price-checking" shows the strongest trusted sides with the fair price.

**Game lines.** These are shown at DraftKings with the no-vig fair chance. There is no team model, so there is no claimed edge.

**Live.** Live uses ESPN's official status. In-game chances for tracked NFL bets come from the box score, time left and the pregame line. They are model only and not yet calibrated.

**Data job.** Every 3 hours, .github/workflows/nfl.yml rebuilds data/nfl and reruns the backtest.

### New data and factor tests (Nov 19)

**New data.**
- From nflverse (free, open):
  - snap share
  - targets, target share and air-yard share
  - QB pressure rate
- From the ESPN core odds feed: closing spread and total.
- From Open-Meteo (free, no key): kickoff weather for outdoor games. Domes come from ESPN's indoor flag.

**How factors were tested.** Each factor was tested per stat out of sample, by comparing Brier score with and without it. A factor is switched on for a stat only where it saved at least 0.0002. The choice is stored in data/nfl/model.json (`use`) and refreshed with every rebuild.

| Factor | Helped | Hurt / result | Status |
|---|---|---|---|
| Opponent + game script | Passing TDs, carries, rushing yards, rush+rec yards, completions, extra points | Kicking points and field goals | On where it helped |
| Target share | Receptions | | On for receptions |
| Snap share | Rushing yards | Carries, rush+rec yards | On for rushing yards only |
| QB pressure | Passing TDs, slightly (below the bar) | | Off |
| Weather | | Small loss (kicking, passing TDs) | Off in the model; shown on game cards as information |

**Out-of-sample right-side rate after the final factor choice:**
- Passing TDs: 60.1% of 163 picks.
- Longest rush: 57.4% of 336.
- Rush+rec yards: 56.6% of 152.
- Everything else: below 54% or under 100 picks.

**Caveat.** The factor choice and its score use the same season, which flatters these numbers somewhat. They need confirming on new weeks as they're added.

**Your own line.** Entered or scanned prices can be at your book's line. The model prices that exact number. DraftKings' line still anchors the projection, and the app flags lines far from it as rough.
