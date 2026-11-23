// Pure aggregation for dvp.json (no network), so it can be tested offline.
// Input: the v3 cache written by build-dvp.mjs. Each game stores one row per player who played:
//   [side (0|1), athleteId, pos ("G"|"F"|"C"|null), starter (0|1), min, pts, reb, ast, tpm, stl, blk]
// and n: [side0 team name, side1 team name].
//
// Why per 36 minutes: ESPN labels players only G, F or C, and teams start anywhere from one to four "G"s.
// Summing a group per game made a defense that faced three-guard lineups look like it allowed 40% more to guards.
// A per-minute rate is the same whether a team starts one guard or four, and it also removes blowout minutes.
export const K = ["min", "pts", "reb", "ast", "tpm", "stl", "blk"];
export const RATE = ["pts", "reb", "ast", "tpm", "stl", "blk"];
export const POS = ["G", "F", "C"];
export const ROLES = ["S", "B"]; // S = starters, B = bench
export const BENCH_MIN = 10; // bench rows count only rotation minutes; deep garbage-time cameos are left out
export const L10 = 10;

const r1 = v => Math.round(v * 10) / 10;
const zero = () => ({ n: 0, sum: K.map(() => 0) });

export function posOf(abbr) {
  const p = String(abbr || "").toUpperCase();
  if (p === "C") return "C";
  if (/^(G|PG|SG)$/.test(p)) return "G";
  if (/^(F|SF|PF)$/.test(p)) return "F";
  if (p.includes("C")) return "C";
  if (p.includes("G")) return "G";
  if (p.includes("F")) return "F";
  return null;
}

function add(acc, row) {
  acc.n++;
  for (let j = 0; j < K.length; j++) acc.sum[j] += row[4 + j];
}

function rates(acc) {
  const min = acc.sum[0], o = {};
  RATE.forEach(k => { o[k] = min > 0 ? r1(acc.sum[K.indexOf(k)] / min * 36) : null; });
  o.mpg = acc.n ? r1(min / acc.n) : null; // average minutes per player-game in this group
  o.n = acc.n; // player-games
  o.min = Math.round(min); // total minutes behind the rates
  return o;
}

function merge(list, role, pos) {
  const a = zero();
  list.forEach(g => { const x = g[role][pos]; a.n += x.n; x.sum.forEach((v, j) => (a.sum[j] += v)); });
  return a;
}

// Rank 1 = allows the most (friendliest), ties share a rank (1, 2, 2, 4)
function rankInto(teams, role, pos, w, k) {
  const vals = Object.entries(teams).map(([t, T]) => [t, T[role][pos][w][k]]).filter(([, v]) => v != null);
  vals.sort((a, b) => b[1] - a[1]);
  vals.forEach(([t, v], i) => {
    const rank = i > 0 && v === vals[i - 1][1] ? teams[vals[i - 1][0]][role][pos][w + "r"][k] : i + 1;
    teams[t][role][pos][w + "r"][k] = rank;
  });
}

export function aggregate(cache, now = new Date()) {
  const games = Object.entries(cache.games || {})
    .map(([id, g]) => ({ id, ...g }))
    .sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));

  const byDef = {}, roles = {};
  for (const g of games) {
    for (const side of [0, 1]) {
      const def = g.n[1 - side];
      const acc = { date: g.date };
      ROLES.forEach(r => { acc[r] = {}; POS.forEach(p => (acc[r][p] = zero())); });
      for (const row of g.p) {
        if (row[0] !== side || !(row[4] > 0)) continue;
        const [, id, pos, st] = row;
        // role history for every player who played (used to decide starter vs backup on the profile)
        const R = (roles[id] = roles[id] || { pos, st: [] });
        R.st.push(st ? 1 : 0);
        if (pos) R.pos = pos;
        if (!pos) continue;
        if (!st && row[4] < BENCH_MIN) continue;
        add(acc[st ? "S" : "B"][pos], row);
      }
      (byDef[def] = byDef[def] || []).push(acc);
    }
  }

  const teams = {}, league = {};
  for (const [def, list] of Object.entries(byDef)) {
    const l10 = list.slice(-L10);
    const T = (teams[def] = { gp: list.length, l10gp: l10.length });
    ROLES.forEach(r => {
      T[r] = {};
      POS.forEach(p => (T[r][p] = { s: rates(merge(list, r, p)), l10: rates(merge(l10, r, p)), sr: {}, l10r: {} }));
    });
  }
  ROLES.forEach(r => {
    league[r] = {};
    POS.forEach(p => {
      const all = Object.values(byDef).flat();
      league[r][p] = rates(merge(all, r, p));
      RATE.forEach(k => ["s", "l10"].forEach(w => rankInto(teams, r, p, w, k)));
    });
  });

  // roles: id -> [games played, games started, starts in last 5, games in last 5, pos]
  const roleOut = {};
  for (const [id, R] of Object.entries(roles)) {
    const l5 = R.st.slice(-5);
    roleOut[id] = [R.st.length, R.st.reduce((a, b) => a + b, 0), l5.reduce((a, b) => a + b, 0), l5.length, R.pos || null];
  }

  return {
    v: 3,
    updated: now.toISOString(),
    season: cache.season,
    per: 36,
    benchMin: BENCH_MIN,
    games: games.length,
    through: games.reduce((m, g) => (g.date > m ? g.date : m), ""),
    teams,
    league,
    roles: roleOut,
  };
}

// Starter or backup from recent games: started at least 3 of his last 5 (or most of fewer).
export function roleOf(r) {
  if (!r || !r[3]) return null;
  return r[2] / r[3] >= 0.6 ? "S" : "B";
}
