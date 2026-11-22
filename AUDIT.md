# NBA prop model bias audit, Nov 22 2026 (second pass)

Reproduce: `node scripts/props-model/audit.mjs` (writes data/nba/audit.json). Every number below comes from that script on 19,887 graded DraftKings lines this season, using pre-game information only.

## What the app was doing

With the model.json deployed before this audit, 84.4% of priced markets were pushed toward the Under and 96.2% of 2%+ EV picks were Unders (127 of 132).

## Root cause

1. **A season-wide intercept.** The model had a constant term (b0 = -0.111) that lowered every Over by about 2.7 points for every player and stat. It was learned mostly from the first two weeks, when Overs won 46% against 49.5% priced. That gap has been closing:

| Week of | Lines | Overs won | DraftKings priced Overs |
|---|---|---|---|
| 2026-10-26 | 4554 | 46.1% | 49.4% |
| 2026-11-02 | 5454 | 46.9% | 49.5% |
| 2026-11-09 | 5308 | 48.9% | 49.4% |
| 2026-11-16 | 4542 | 48.6% | 49.6% |

   Fit on earlier weeks only, the old model moved the average prop toward the Under by 1.84 pts (week of 2026-11-09) and 1.0 pts (week of 2026-11-16), while Overs actually ran 0.54 and 0.99 points below DraftKings' price. The size of the real gap swings week to week (3.3, 2.6, 0.5 and 1.0 points), so a fixed push is too big some weeks and about right in others. It also lands on every prop of every player the same way, which is what stacked the Unders. Most important: it is a level, not information about tonight's game.

2. **A floor on the per-stat accuracy share (k).** k is the share of the model's move away from DraftKings that showed up in later results. The old rule pulled k toward 0.8 and never let it go below 0.3, so stats where the model's moves lost out of sample (3-Pointers raw k -0.518, Blocks -2.344) still counted 30% of the move.

3. **The same push on every market of one player.** The intercept, the combo and back-to-back terms and the player's recent hit rate are identical across Points, Pts+Reb, Pts+Ast, Pts+Reb+Ast and Reb+Ast. When DraftKings prices a player near 50/50 on all of them, they all clear the bar as Unders at once. Example, Nov 9, model fit on earlier weeks:

| Cooper Flagg prop | DraftKings no-vig Over | Model Over | Pick | Result |
|---|---|---|---|---|
| Pts+Reb 32.5 | 51% | 45.7% | Under, 3.7% EV | 53 (lost) |
| Points 25.5 | 49.3% | 44.3% | Under, 3.6% EV | 43 (lost) |
| Pts+Reb+Ast 40.5 | 48.4% | 43.6% | Under, 2.6% EV | 59 (lost) |
| Reb+Ast 14.5 | 48.7% | 44.1% | Under, 2.1% EV | 16 (lost) |

   Each one got the same push in log-odds: intercept -0.11, back-to-back -0.08, combo -0.05, his own numbers about 0. Four correlated Unders in one game, all lost. Across the two test weeks the old rules picked against Flagg 4 times, all Unders, 0 won.

4. **The projections do not underestimate players.** DraftKings' lines are close to unbiased on the mean (line minus actual -0.05). Season averages run 0.27 below what players scored and the app's projection 0.18 below, so if anything the inputs lean low, not the outputs. Overs still lose slightly more than priced because these stats are skewed: a few big games lift the average above the typical game.

| Stat | Lines | Overs won | Priced | Line minus actual | Season avg minus actual | App projection minus actual |
|---|---|---|---|---|---|---|
| Points | 2769 | 47.6% | 50% | -0.13 | -0.4 | -0.29 |
| Assists | 2032 | 48.4% | 49.3% | -0.12 | -0.1 | -0.14 |
| Rebounds | 2580 | 48.2% | 49.1% | -0.12 | -0.07 | -0.15 |
| 3-Pointers | 2235 | 48.7% | 47.9% | -0.15 | -0.09 | -0.06 |
| Steals | 865 | 43.9% | 48.9% | -0.02 | 0.15 | 0.12 |
| Blocks | 413 | 44.3% | 47.4% | -0.05 | 0.14 | 0.1 |
| Pts+Ast | 2115 | 47.7% | 49.9% | 0.02 | -0.54 | -0.29 |
| Pts+Reb | 2611 | 47% | 50% | 0.02 | -0.43 | -0.24 |
| Reb+Ast | 2084 | 48.8% | 49.8% | -0.08 | -0.15 | -0.15 |
| Pts+Reb+Ast | 2183 | 46.6% | 50% | 0.17 | -0.57 | -0.23 |

## Correction

- **First pass (morning):** removed the intercept and the k floor. That was not enough: the combo and count flags and the raw averages absorbed the same lean, and the app still showed about 95% Unders.
- **Second pass: no level terms at all.** The model now starts exactly at DraftKings' no-vig chance (fixed, not fitted) and every feature is measured against its own average for that stat. It can only say "this player tonight differs from a typical prop of this stat". Nothing in it can move a whole stat, or every prop, toward one side. The combo and count flags are gone.
- **k shrunk toward the market with no floor**: k = sum(result gap × model move) / (sum(model move²) + 0.5), kept between 0 and 1, estimated walk-forward. A stat with k = 0 is priced at DraftKings' no-vig chance.

| Stat | Raw k (walk-forward) | Old k | New k |
|---|---|---|---|
| Points | 0.189 | 0.735 | 0.11 |
| Assists | 0.156 | 0.482 | 0.077 |
| Rebounds | -0.55 | 0.621 | 0 |
| 3-Pointers | -0.518 | 0.3 | 0 |
| Steals | 1.612 | 1 | 0.468 |
| Blocks | -2.344 | 0.3 | 0 |
| Pts+Ast | 0.111 | 0.744 | 0.055 |
| Pts+Reb | -0.355 | 0.755 | 0 |
| Reb+Ast | -0.279 | 0.502 | 0 |
| Pts+Reb+Ast | -0.026 | 0.865 | 0 |

- **Top List groups overlapping stats.** Two props on one player that share a box-score stat (Points with Pts+Reb, 3-Pointers with Points, any two combos) are never both listed. The stronger is kept and the other is held as "same player and same stat". A second prop on a player is allowed only if it shares no stat with the first and, on the default setting, is exceptional (5%+ EV, High confidence).
- **Side balance check** in "How tonight's slate was evaluated": markets leaning Over / Under, qualified Overs / Unders, any player with 3+ qualified props, and last week's actual Over rate. It flags; it changes nothing.
- Nothing forces Overs or a split, and the 2% minimum EV is unchanged.

## Validation

Walk-forward: weeks of 2026-11-09 and 2026-11-16, each priced by a model and k fit only on earlier weeks.

| | Before | After | DraftKings alone |
|---|---|---|---|
| Brier score | 0.2468 | 0.2466 | 0.2466 |
| Log loss | 0.6867 | 0.6863 | 0.6863 |
| Average move vs DraftKings, by week | -1.84, -1 pts | 0.01, 0.02 pts | actual: -0.54, -0.99 pts |
| Side shown on each prop, Over / Under | 13.1% / 86.9% | 49% / 51% | |
| Markets leaning Under / Over | 87.8% / 12.2% | 10.2% / 14.8% | |
| Leaning-Under markets, predicted vs actual Under | 51.9% vs 50.7% | none | |
| 2%+ EV picks | 121 (121 Under), 54.5% won, ROI 2.9% | 0 | |
| 2 to 4% EV band | 96 picks, ROI -7.8% | 0 | |
| Top Lists with a player twice | 1 of 7, 1 overlapping pair | no picks to stack | |

With the level removed, the player information alone, before any k, made these 2%+ EV picks (each week priced by a fit on earlier weeks): week of 2026-11-09, 209 picks, ROI -15.9%; week of 2026-11-16, 210 picks, ROI -2.6%. Those lost, which is why k sends most stats back to DraftKings' price.

## What this means

- The side shown on each prop is now about 49% Over and 51% Under, from the data, not from a rule. Calibration holds: when the model says 55%, it happens about 55% of the time.
- Accuracy: out of sample the model ties DraftKings' own price (log loss 0.6863 vs 0.6863). Every free input it uses (averages, recent form, minutes, back-to-backs, teammates out; game total, spread and opponent injuries were tested separately) is already in DraftKings' line. None beat it by a margin that held in both test weeks.
- So on a DraftKings-only slate the Top List will usually be empty, and that is the honest output. Picks come from a better price elsewhere: enter or scan the Fliff price and Sharpline compares it with DraftKings' fair chance.
- Real but too small to bet: Overs have run below DraftKings' price every week this season (0.5 to 3.3 points). That is less than the vig, and its size has swung too much to build in.

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
