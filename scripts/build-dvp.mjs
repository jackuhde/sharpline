// Builds dvp.json: what each NBA defense allows to opposing guards, forwards and centers, split into starters and bench.
// Source: ESPN's free box scores (regular season only). Runs nightly in GitHub Actions; only new games are fetched.
// Stats are per 36 minutes played, so the number of players ESPN labels G, F or C in a lineup doesn't change the result.
// Math lives in dvp-agg.mjs (tested offline in tests/dvp.test.js).
import fs from "node:fs";
import { aggregate, posOf } from "./dvp-agg.mjs";
const BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const CACHE = "data/dvp-games.json", OUT = "dvp.json";
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { headers: { "user-agent": "sharpline-dvp" } }); if (r.ok) return r.json(); if (r.status === 404) return null; } catch (e) {}
    await sleep(1500 * (i + 1));
  }
  throw new Error("fetch failed " + url);
}
const num = v => { const x = parseFloat(String(v ?? "0").split("-")[0]); return isNaN(x) ? 0 : x; };

const V = 3; /* bump to refetch every game when what is stored changes (v3: one row per player, starters and bench, athlete ids) */
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : { season: null, dates: {}, games: {} };
if (cache.v !== V) { cache.v = V; cache.dates = {}; cache.games = {}; }
const sb = await get(`${BASE}/scoreboard`);
const season = sb.season.year, cal = (sb.leagues[0].calendar || []).map(d => d.slice(0, 10));
if (cache.season !== season) { cache.season = season; cache.dates = {}; cache.games = {}; }
const today = new Date().toISOString().slice(0, 10);
let fetched = 0, skipped = 0;
for (const d of cal) {
  if (d >= today || cache.dates[d]) continue;
  const day = await get(`${BASE}/scoreboard?dates=${d.replace(/-/g, "")}`); await sleep(250); if (!day) continue;
  let allDone = true;
  for (const e of day.events || []) {
    if (((e.season || {}).type) !== 2) continue;
    const st = ((e.competitions || [])[0] || {}).status || e.status || {};
    if (!(st.type || {}).completed) { allDone = false; continue; }
    if (cache.games[e.id]) continue;
    const s = await get(`${BASE}/summary?event=${e.id}`); await sleep(300); fetched++;
    const sides = (s && s.boxscore && s.boxscore.players) || [];
    if (sides.length !== 2) { skipped++; allDone = false; continue; } // retry tomorrow instead of caching a hole
    const g = { date: d, n: sides.map(x => x.team.displayName), p: [] };
    let starters = [0, 0];
    sides.forEach((side, i) => {
      const S = (side.statistics || [])[0] || {}, lab = (S.labels || S.names || []).map(x => String(x).toUpperCase()), ix = k => lab.indexOf(k);
      (S.athletes || []).forEach(a => {
        if (a.didNotPlay || !a.stats || !a.stats.length) return;
        const v = k => (ix(k) < 0 ? 0 : num(a.stats[ix(k)]));
        const min = v("MIN"); if (!(min > 0)) return;
        if (a.starter) starters[i]++;
        g.p.push([i, String((a.athlete || {}).id || ""), posOf(((a.athlete || {}).position || {}).abbreviation), a.starter ? 1 : 0,
          min, v("PTS"), v("REB"), v("AST"), v("3PT"), v("STL"), v("BLK")]);
      });
    });
    if (starters[0] !== 5 || starters[1] !== 5) console.warn(`warn: ${e.id} ${d} starters ${starters.join("/")}`);
    cache.games[e.id] = g;
  }
  if (allDone && (day.events || []).length) cache.dates[d] = 1;
}

const out = aggregate(cache);
fs.mkdirSync("data", { recursive: true });
fs.writeFileSync(CACHE, JSON.stringify(cache));
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`season ${season}: ${out.games} games (${fetched} new, ${skipped} without a box score), ${Object.keys(out.teams).length} teams, ${Object.keys(out.roles).length} players, through ${out.through}`);
