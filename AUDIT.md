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

## Phase 5 notes (done)

- **Dashboard** at the top of the Top List: tonight's games, date, first tip and when lines were updated; best priced edge; your tracked record and open bets (tap to open Tracker); injury notes. Injuries and line moves expand underneath.
- **Settings** (gear in the header): your sportsbook name (used in labels; grading is the same for any book), Top List minimum edge (default 2%) and minimum confidence, default stake, clear today's entries, delete tracked bets, CSV export, and how the numbers work. Filters hide bets and say how many are hidden; they never change a grade, edge or confidence.
- **Self-hosted fonts** (Archivo, JetBrains Mono, SIL Open Font License, 128 KB). The app makes no outside requests on load besides its own files, so it opens faster and works fully offline after the first visit.
- Phone header: the date moved into the dashboard so Scan and Settings fit.

Phase 4 (calibration) lives in the Tracker's "Is Sharpline accurate?" section and fills in as bets are settled. A true backtest still needs paid historical odds data.

## Round 6 notes (Nov 17)

- **Live data (free, no key):** ESPN's public feeds, read from the phone. Game lines (DraftKings moneyline, spread, total and opening numbers), game status and scores refresh every minute near game time. Injuries refresh every 5 minutes. Verified working from the live GitHub Pages site. Player props have no free live feed, so they still come from the researched board, now refreshed hourly from 10:43 AM to 8:43 PM ET.
- **Injuries change the board:** an Out player's props are pulled from the Top List and closed. Questionable and doubtful players drop to Low confidence. A rotation teammate newly ruled out lowers confidence on that team's props and adds a note. Usage is not re-projected numerically.
- **Stale-line protection:** every bet shows how current its market is (Live, Updated, Verify, Stale). Bets whose market is over 3 hours old leave the ranked list for "Needs verification". Started games close their editors and drop off the Top List.
- **Automatic grading:** each tracked bet stores its exact line, side, player, stat and teams. Finals are graded from ESPN box scores: W, L, push on exact lines, void when the player did not play or the game was postponed or canceled. Anything that can't be verified stays pending. A reopened bet is never auto-graded again. Tested against the real Knicks 112, Raptors 108 OT final.
- **Refresh:** a header button and pull-to-refresh trigger one full refresh (board, live lines, injuries, grading). Repeat taps join the refresh in progress, and a 15-second cooldown prevents hammering. The result says what updated and what failed.
- **Scanner:** prediction markets (Kalshi, Polymarket, ProphetX and others): YES/NO prices in cents, "25+" contracts, and wager and payout amounts, with a warning when the payout doesn't match the odds.
- **Design:** new icon (a dot above the line), orange brand accent, no glows or ambient gradients, smaller corners, shorter copy, expert check collapsed, calmer motion (view fade, row reveal, list reorder, value flashes, scanner sweep, splash).
- **Removed:** "Add a missing player". Scans already add unlisted players, and the hourly board covers the rest.
- **Not done (needs a decision):** accounts and synced tracking across devices need a backend. Player photos are not included: monogram avatars stay.
- Tests: 33 math, 17 parser, 26 live and grading.

## Projection and grade consistency (Nov 17)

- **One projection per prop:** "proj" is what Sharpline expects tonight: the player estimate (season and last-10 averages, minutes trend, blowout risk from the spread, newly ruled-out teammates) averaged with the market's estimate (book line, moved by two-sided prices). 60/40 player-to-market with last-10 data, 50/50 on season averages, market only with no averages. The pick, percentage and tier all come from this number. Research text is kept only as a labeled note.
- **Top List follows the projection:** a researched spot whose side or line disagrees with tonight's projection is dropped.
- **Grade capped by confidence:** Low confidence tops out at C, Medium at B, and only High confidence can be A or S. This holds on every row, editor result and Top List card.

## Live props for every player, live averages, grade scale (Nov 17)
- Props: DraftKings player props for every posted player come from ESPN's free core feed (`propBets`), read from the phone every ~8 minutes. Pairs are Over then Under; verified against DraftKings' own milestone prices (Barnes Pts+Ast Over 25.5 = "26+" at -128). Markets: points, rebounds, assists, threes, steals, blocks, PRA, P+R, P+A, R+A, double double, triple double. Steals+blocks, first basket and quarter props are not in the feed.
- Researched board props are kept and merged; when DraftKings has a live price at the same line, older research prices are not used for grading.
- Averages: season and last-10 (points, rebounds, assists, threes, steals, blocks, minutes, double-double rate) computed from each player's ESPN game log, cached per day.
- Stable keys: entered odds, saved finds and tracked bets follow the player when props are added (remapKeys).
- Projection: market read on the same curve as the projection (Poisson for count stats), player weight 45% with last-10 data (35% season only) when a two-sided price exists; chance held within 7 points of DraftKings' no-vig chance; side follows the projection.
- Grades: S 8%+ (max 3 per night, needs agreement with the market and no cap), A 3%+, B 1%+, C -1.5%+, D -4%+, F below; then reliability steps and the confidence cap. Tonight: 582 props, about 1 S, 37 A, 37 B.

## Player profiles (Nov 17)
- profile.js: tap a player's jersey card or name anywhere (props rows, your own added rows, Top List cards, watch list, scanner results, tracker bets) to open a full-screen profile over the current screen. Back (button, swipe or browser back) closes it; the list underneath is never re-rendered away, so filters, sort and scroll stay put.
- Opens on the prop it was tapped from. Market chips switch props; the prop panel shows the live line, both sides with prices, model chance and EV, Sharpline's projection (labeled model), grade and confidence, DraftKings' last line move time, when prices were checked, and stale or started warnings.
- Actual results (ESPN game logs, regular season): bar chart vs tonight's line for L5, L10, L20 and vs tonight's opponent (this season and last), averages for Season, L5, L10, L20, Home, Away and vs opponent, and a game log with the selected stat highlighted.
- Headshots are not used. Player photos are not something Sharpline places in the app; the jersey card is the player image.
- Tracked bets now store the player's team and ESPN id so old bets can still open a profile.

## Live section, live projections, follows (Nov 17)
- New Live tab (livegame.js). Scores, clock and period from the ESPN scoreboard every 20 seconds while the screen is open. Box score, plays and ESPN win probability from the ESPN summary feed.
- Live game lines and live player props are DraftKings' in-game markets (ESPN core odds, provider 200). Pregame open and close game lines are DraftKings provider 100.
- Market states: Live (in the latest fetch and recently updated), "Not updated for N min" (still listed but its price has not changed for over 4 minutes while newer markets in the same feed have), Suspended or pulled (missing from the latest fetch). EV is hidden unless the market is Live and the fetch is under 75 seconds old. EV is also hidden when only one side is posted.
- ESPN's per-market lastUpdated runs on a shifted clock, so it is only compared with other markets in the same feed, never shown as a time.
- Line movement history is not available free. The app records what it sees on this phone (game totals and player props) and charts that, labeled as such.
- Live model: current stat plus per-minute rate times expected minutes left. Rate blends season and last-10 per-minute production with tonight's rate. Minutes left shrink for foul trouble and blowouts, zero if ejected or fouled out. Probability is 35% model and 65% DraftKings no-vig, held within 4 points of the market. "Potential edge" needs EV of 3% or more.
- Not modeled live: opponent defense and pace beyond tonight's in-game rates, injuries beyond ESPN's status, Yes/No markets (double double, triple double).
- Started games stay in Props with a "Live now" tag and their pregame lines and grades, kept for comparison, with a link to Live.
- Game view updates in place (only changed blocks are replaced) so taps and scroll position survive refreshes.
- Profiles: turnovers added to averages and the game log. DraftKings alternate lines (milestones, Over only) listed with implied chance and his actual hit rate; tapping one charts his games against it. No EV on these because only one side is posted.
- Follow a player (star in the profile), recently viewed players, and injury-change alerts for followed players (checked on each ESPN injury refresh, shown as a toast and in the Props tab). All stored on this phone only. Cross-device sync needs accounts, which are not built.
- Tests: tests/live.test.js now covers game-line parsing (live and pregame), alternate lines and minutes left (47 checks).

## Live value, game status, parlays, accuracy, matchups, layout (Nov 18)
- Live props and live game lines are judged on both sides at their own posted prices: Sharpline's chance, the chance the price needs, the edge in points, EV, projected final. Verdicts: Good value (EV 3%+), Close to fair (0 to 3%), Poor price (below 0), or no verdict when the price is stale, one-sided, or the player has fewer than 5 games. "Chance he reaches N+" and "this bet wins" are shown separately.
- Live game-line model: pregame DraftKings close plus tonight's pace and minutes left; normal spread of 12 (margin) and 19 (total) points for a full game, shrinking with the square root of time left; blended 35/65 with DraftKings no-vig and held within 4 points.
- Only DraftKings' live prices are free, so there is no live best-price comparison across books.
- Game status comes from ESPN's status name (upcoming, delayed, postponed, live, halftime, suspended, final), never the clock. Started and finished games leave Props and Lines and sit in a collapsed "pregame lines kept for comparison" section.
- Refresh text removed. Live shows "Updated h:mm", a pulsing dot while fetching, and warnings only when data is stale or a fetch failed.
- Tracker: parlay slip (+ Parlay on any row), combined odds, same-game parlays flagged as correlated (no combined chance shown; enter the book's parlay odds), per-leg auto-grading, standard settlement (a losing leg loses; push/void legs drop and the parlay is repriced from the remaining legs), filters by type, result and date.
- Your bets (win %, straight vs parlay, profit, ROI, units, parlays by size, leg accuracy) are reported separately from Sharpline's prop predictions (every priced pregame prop the app rated, logged until tip and graded after the final: accuracy by stat, grade, probability bucket with expected vs actual, and by day). Pushes are excluded from accuracy. The prediction log only covers games this phone had loaded before tip.
- Opponent vs position: built nightly by .github/workflows/dvp.yml from ESPN box scores (scripts/build-dvp.mjs → dvp.json). ESPN labels positions only G, F, C. Season and last-10 per-game totals allowed, league average, rank (1st = allows most). Context only; not added to projections.
- Layout: content up to 1360px on desktop with two- and three-column grids for Top List, Lines, Props rows, Live cards and live props; tighter padding and larger touch targets on phones.

## Nov 18, evening
- Opponent vs position now counts only each team's five starters (ESPN box score `starter` flag), grouped by ESPN's G/F/C label. The build script refetches every game when its cache version changes.
- Open tracked bets in an in-progress game show Sharpline's live chance to win, refreshed with every live poll (20s). Same-line DraftKings market: blended 35/65 with its no-vig price. Other lines: model alone, labeled. Parlays: product of pending legs when not same-game; same-game parlays get per-leg chances only. Live chances are not yet graded for calibration.
- Live polling now runs on every tab whenever a game is in progress (was: only the Live tab or an open game). Pregame props cache cut from 8 to 2 minutes.
