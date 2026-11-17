# Sharpline Audit and Implementation Plan

Audit date: Nov 17, 2026. Baseline saved as commit a93da70 on GitHub. To restore the original app: `git checkout a93da70 -- .` then commit.

## 1. What Sharpline is today

| Piece | How it works |
|---|---|
| Hosting | Static site on GitHub Pages (free). No backend, no API keys anywhere. |
| App shell | `index.html` (one file, about 100 KB), installable on iPhone via `manifest.webmanifest` and `sw.js` (offline cache). |
| Data | `data.json`, written 3x a day (10:43 AM, 2:43 PM, 5:43 PM ET) by a scheduled Claude task that researches published lines and pushes to GitHub. The app checks for a new version every 3 minutes. |
| Sports | NBA only. |
| Tabs | Top List, Props, Lines, Parlay. Scan button opens the screenshot reader. |
| Scanner | Free on-device OCR (Tesseract.js in `vendor/`), parser in `ocrparse.js`, editable review list before grading. Screenshots never leave the phone. |
| Storage | On-device only (localStorage): your entered lines, auto-saved finds, custom players, parlay. Cleared each new slate day. |

## 2. Concrete audit findings

Severity: High = can show a wrong edge. Medium = misleading or missing. Low = polish.

| # | Area | Finding | Severity | Status |
|---|---|---|---|---|
| A1 | Top List | Spots with no posted price were ranked with an EV computed on an assumed -110. | High | Fixed in Phase 1 |
| A2 | Top List | Conditional spots ("Only if Fliff hasn't moved from 36.5") were ranked on an old price. The #1 pick today (+9.8%) used a midnight price after the market moved 2 points. | High | Fixed in Phase 1 |
| A3 | EV math | Whole-number lines (spread 7, total 220, 25 points) ignored pushes, which overstated EV on both sides. | High | Fixed in Phase 1 |
| A4 | Freshness | No warning when the board is from yesterday or hours old. | High | Fixed in Phase 1 |
| A5 | Testing | No tests on any calculation. | High | Fixed in Phase 1 (24 tests) |
| A6 | Labels | "My estimate" mixes two different things: a de-vigged market price and a season-average projection. They are not shown separately. | High | Fixed in Phase 2 |
| A7 | Circularity | For props with only a line, the estimate is 70% book line plus 30% projection, then compared back to books. It is not independent confirmation. | Medium | Fixed in Phase 2 (basis shown on every bet) |
| A8 | Projection model | Season averages only. No minutes, recent form, injuries to teammates, opponent defense, pace, rest. The fixed SD formulas and the 40% shrink toward 50% are reasonable guards but not calibrated. | Medium | Partly fixed in Phase 2: last 10 games, minutes trend, out players (once the data task supplies them). Opponent, pace and rest still to come. |
| A9 | Line shifts | Moving the line uses a flat per-point rate (Points 4.5% per point). Fine near the posted line, rough far away (already flagged in the app). | Medium | Fixed in Phase 2 (bell-curve shifts by market) |
| A10 | Grades | One letter mixes edge size and data quality. You can't tell "big edge, shaky data" from "small edge, solid data". | Medium | Fixed in Phase 2 (grade kept, Confidence added) |
| A11 | Parlay | Multiplies leg chances as if independent. Same-game legs only get a warning. | Medium | Removed at your request (Parlay tab replaced by Bet Tracker) |
| A12 | Scanner | Built around Fliff-style layouts. Doesn't read decimal or fractional odds, sentence-style tips ("Brunson over 26.5 pts -115"), or bet slips with multiple legs as a parlay. | Medium | Fixed in Phase 3 |
| A13 | Bet tracking | Does not exist. Nothing is kept after the day resets. | Medium | Fixed in Phase 3 |
| A14 | Model validation | No record of past estimates vs results, so accuracy can't be measured. | Medium | Started in Phase 3: the Tracker logs the estimate on every bet and scores it once settled |
| A15 | Expert check | Only a formula (weight = picks / (picks + 2000)). No tracked expert records. | Low | Phase 4, only with verifiable records |
| A16 | Fonts | Loaded from Google Fonts, so the first load needs a connection. | Low | Phase 5 |

What works and stays: the 4-tab layout, line and odds editors with +/− sign buttons, auto-adding green finds, the review step in the scanner, on-device processing, the power-method de-vig, the app install and launch animation, and the scheduled data flow.

## 3. Safe implementation boundary

These rules hold for every phase.

**In bounds**
- Edits to `index.html`, `ocrparse.js`, `sw.js`, plus new files (`tests/`, small JS modules).
- New on-device storage keys. Existing keys (`sl_edv`, `sl_saved`, `sl_cust`, `sl_parlay_v2`, `sl_date`, `sl_fo`) keep their format, so nothing you've entered breaks.
- Adding optional fields to `data.json`. The app must still work with files that lack them.

**Out of bounds unless you approve it first**
- Any paid service, API key, server, or account. Everything stays free.
- Removing a tab, editor, or the scanner review step.
- Renaming or removing existing `data.json` fields.
- Sending screenshots or bet history off your phone.
- Showing any number that wasn't published or computed. Missing means "no data", never a guess.
- Placing bets, moving money, or recommending stake increases after losses.

**Every change ships only if**
1. `node tests/math.test.js` passes.
2. A headless browser loads the app with zero script errors and every tab renders.
3. Changed screens are checked on a phone-sized screen.
4. It's committed as its own step, so any phase can be rolled back.

## 4. Data reality (what can and can't be done for free)

| Want | Free option | Limit |
|---|---|---|
| Live multi-book odds | The Odds API free tier (500 requests a month) | About 16 refreshes a day for NBA game lines only. Props cost credits per market. The key can't go in the public site, but the scheduled task could hold it. Needs your sign-up. |
| Kalshi, Polymarket prices | Public pages and APIs | Used today through published previews. Direct API use is possible from the scheduled task. |
| Player game logs, minutes, usage | Basketball Reference, NBA.com stats | Usable by the scheduled task, not the phone. Lets the projection use last 10 games, minutes and role. |
| Historical odds for backtesting | None free with real coverage | Real backtests need paid data. The free path is to log every estimate from now on and grade it, so calibration builds up over weeks. |
| NFL and other sports | Same research approach | Doubles the scheduled task's work. Best added after NBA is solid. |
| Fliff odds | None published | Stays user-entered or scanned. |

## 5. Phased plan

| Phase | Scope | Deliverables |
|---|---|---|
| 1. Stabilize (done) | Correctness fixes | A1 to A5. Restore tag, tests, stale warnings, push-aware EV, watch list. |
| 2. Core analytics | Honest numbers | Separate Market fair, Sharpline projection and Book implied on every row. Edge and Confidence shown separately (grade kept). Distribution-based line shifts. Scheduled task adds last-10 averages, minutes and out players to `data.json`, and the projection uses them. |
| 3. Tools | Scanner, parlay, tracker | Universal scanner: decimal and fractional odds, sentence tips, multi-leg slips into the parlay checker, "screenshot price vs current price" view. Parlay correlation adjustment for same-game pairs. Bet Tracker tab: log, settle, ROI, win rate, by market. Every estimate logged for grading. |
| 4. Validation | Is the model any good? | Calibration chart, Brier score and results by grade from the logged estimates. Expert records only where verifiable. |
| 5. Polish | UX | Dashboard header, settings (min edge, bankroll units, books), self-hosted fonts, layout refinements. |

Responsible use applies throughout: no "lock" language, "Pass" and "No edge" are normal results, stakes are never raised after losses, and every estimate shows its source.

## Phase 2 notes (done)

- Every bet shows three numbers for the side Sharpline would take: **Market fair** (book or prediction-market prices with the vig removed), **Sharpline proj** (player averages only, never book prices), and **Book implied** (the odds you entered, vig included). A line under them says which one drives the edge.
- **Confidence** (High, Medium, Low) is separate from the grade. It goes up with a two-sided market price and projection agreement, and down for one-sided prices, volatile stats, lines far from the market, old data and injury tags. The S to F grade is unchanged.
- Line moves use a bell curve per market (spread SD 12.5, total SD 18, player stats scale with the line). Push chances on whole numbers come from the same curve.
- Projections blend season and last-10 averages 65/35 and scale for recent minutes (capped at 15%) when `data.json` has those fields. Players listed in a game's `out` list get no projection.
- Tests: 33 passing (`node tests/math.test.js`).

## Phase 3 notes (done)

- **Parlay tab removed** (your call). Its spot is now **Tracker**. "+ Parlay" buttons are now "+ Track".
- **Bet Tracker**: logs pick, odds, book, stake, Sharpline's estimate, edge, grade and confidence at the moment you track it. Settle as Won, Lost, Push or Void. Shows record, net, ROI, win rate vs break-even, results by market, and an accuracy check (Brier score vs the book's own price and a coin flip, plus expected vs actual by estimate range). Kept across days, on the phone only. CSV export. Flat default stake, never raised after losses.
- **Universal scanner**: reads any sportsbook, bet slips and plain-text tips ("Brunson over 26.5 pts -115", "o26.5"). Converts decimal and fractional odds (and flags them for checking). Detects the book name and parlay slips (each leg graded alone). Grades the exact line and price in the screenshot, and shows what the board has now beside it. One-sided tips are graded on the side given. Unknown players need season averages or both prices.
- **Books disagree**: when sources post different lines for a prop, Sharpline now uses the line least favorable to the bet and lowers confidence. This removed a false S grade (Barnes Over 19.5) caught in testing.
- Tests: 33 math + 10 parser tests passing, plus browser checks of tracking, settling, reload persistence and a real OCR read of a tipster image.

Known limits: the book name is read once per screenshot, so a post naming two books labels every line with the first one found. No team model for game lines yet.
