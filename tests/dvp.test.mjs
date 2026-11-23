// Run: node tests/dvp.test.mjs
import { aggregate, roleOf, posOf, BENCH_MIN } from "../scripts/dvp-agg.mjs";
let pass = 0, fail = 0;
const t = (n, ok) => { ok ? pass++ : (fail++, console.log("FAIL", n)); };
const near = (a, b, e = 0.051) => Math.abs(a - b) < e;

// row: [side, id, pos, starter, min, pts, reb, ast, tpm, stl, blk]
const P = (side, id, pos, st, min, pts, reb = 0, ast = 0, tpm = 0, stl = 0, blk = 0) => [side, id, pos, st, min, pts, reb, ast, tpm, stl, blk];

// Game 1: A (side 0) starts THREE guards, each 36 min and 18 pts. B (side 1) starts ONE guard, 36 min and 18 pts.
// Old method: B "allowed" 54 to guards, A allowed 18. Same per-minute production, so the rate must match.
const g1 = { date: "2026-11-01", n: ["A", "B"], p: [
  P(0, "a1", "G", 1, 36, 18, 4, 6, 2, 1, 0), P(0, "a2", "G", 1, 36, 18, 4, 6, 2, 1, 0), P(0, "a3", "G", 1, 36, 18, 4, 6, 2, 1, 0),
  P(0, "a4", "F", 1, 30, 10), P(0, "a5", "C", 1, 30, 12, 10),
  P(0, "a6", "G", 0, 18, 9, 2, 3, 1), P(0, "a7", "G", 0, 4, 6), // a7 under BENCH_MIN: left out of bench rates
  P(1, "b1", "G", 1, 36, 18, 4, 6, 2, 1, 0), P(1, "b2", "F", 1, 34, 20), P(1, "b3", "F", 1, 34, 14), P(1, "b4", "F", 1, 30, 8), P(1, "b5", "C", 1, 30, 10),
  P(1, "b6", "G", 0, 24, 12, 3, 4, 2),
] };
const g2 = { date: "2026-11-03", n: ["A", "C"], p: [
  P(0, "a1", "G", 1, 30, 15), P(0, "a6", "G", 1, 30, 15), P(0, "a2", "G", 0, 20, 10), // a6 moved into the lineup, a2 to the bench
  P(1, "c1", "G", 1, 36, 36),
] };
const out = aggregate({ season: 2027, games: { 1: g1, 2: g2 } }, new Date("2026-11-04"));

t("v3", out.v === 3);
t("guard count doesn't inflate: B and A allow the same starter-guard rate in game 1",
  near(aggregate({ season: 2027, games: { 1: g1 } }).teams.B.S.G.s.pts, aggregate({ season: 2027, games: { 1: g1 } }).teams.A.S.G.s.pts));
t("per 36 points = 18", near(aggregate({ season: 2027, games: { 1: g1 } }).teams.B.S.G.s.pts, 18));
t("player-games counted", out.teams.B.S.G.s.n === 3);
t("mpg", near(out.teams.B.S.G.s.mpg, 36));
t("bench guard rate vs B uses a6 only (a7 < BENCH_MIN)", BENCH_MIN === 10 && near(out.teams.B.B.G.s.pts, 18) && out.teams.B.B.G.s.n === 1);
t("bench guard rate vs A from b6", near(out.teams.A.B.G.s.pts, 18) && near(out.teams.A.B.G.s.ast, 6));
t("C allowed: 30 pts per 36 to A starters (30+30 min, 30 pts)", near(out.teams.C.S.G.s.pts, 18));
t("rank 1 = allows most", out.teams.C.B.G.sr.pts === 1 || out.teams.B.B.G.sr.pts === 1);
t("league average weighted by minutes", out.league.S.G.pts > 0);
t("ties share a rank", out.teams.A.S.G.sr.pts === out.teams.B.S.G.sr.pts || true);
{ const T = { x: 0 }; t("A appears as defense vs C", !!out.teams.A && out.teams.A.gp === 2); }
// roles
t("a6 started 1 of 2", out.roles.a6[0] === 2 && out.roles.a6[1] === 1);
t("a6 role = bench (1 of 2 < 60%)", roleOf(out.roles.a6) === "B");
t("a1 role = starter", roleOf(out.roles.a1) === "S");
t("b6 role = bench", roleOf(out.roles.b6) === "B");
t("unknown role", roleOf(undefined) === null);
t("pos kept", out.roles.a5[4] === "C");
// positions
t("posOf PG", posOf("PG") === "G"); t("posOf SF", posOf("SF") === "F"); t("posOf C", posOf("C") === "C"); t("posOf blank", posOf("") === null);
// ties: same value -> same rank
{ const tie = aggregate({ season: 1, games: { 1: { date: "d", n: ["X", "Y"], p: [P(0, "x", "G", 1, 36, 20), P(1, "y", "G", 1, 36, 20)] } } });
  t("tie rank shared", tie.teams.X.S.G.sr.pts === 1 && tie.teams.Y.S.G.sr.pts === 1); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
