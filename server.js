
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const FALLBACK_FILE = path.join(__dirname, "data", "fallback.json");

const cache = new Map();
const TTL = {
  state: 30 * 60 * 1000,
  players: 24 * 60 * 60 * 1000,
  stats: 10 * 60 * 1000,
  values: 5 * 60 * 1000,
  catalog: 5 * 60 * 1000,
};

function cached(key) {
  const hit = cache.get(key);
  if (!hit || Date.now() > hit.expires) return null;
  return hit.value;
}
function put(key, value, ttl) {
  cache.set(key, { value, expires: Date.now() + ttl });
  return value;
}

async function getJson(url, timeoutMs = 10000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: {
        "User-Agent": "NFLTradeLab/9.0",
        "Accept": "application/json",
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getState() {
  const key = "state";
  const hit = cached(key);
  if (hit) return hit;
  try {
    return put(key, await getJson("https://api.sleeper.app/v1/state/nfl"), TTL.state);
  } catch {
    return put(key, {
      season: String(new Date().getFullYear()),
      week: 1,
      season_type: "regular",
      display_week: 1,
    }, TTL.state);
  }
}

async function getSleeperPlayers() {
  const key = "players";
  const hit = cached(key);
  if (hit) return hit;
  const data = await getJson("https://api.sleeper.app/v1/players/nfl?active=true", 18000);
  return put(key, data, TTL.players);
}

function normalizeStatsPayload(payload) {
  const out = {};
  if (Array.isArray(payload)) {
    for (const row of payload) {
      const id = String(row.player_id ?? row.player?.player_id ?? row.player?.id ?? "");
      if (!id) continue;
      out[id] = row.stats || row;
    }
    return out;
  }
  if (payload && typeof payload === "object") {
    for (const [key, row] of Object.entries(payload)) {
      const id = String(row?.player_id ?? row?.player?.player_id ?? key);
      out[id] = row?.stats || row || {};
    }
  }
  return out;
}

async function getSeasonStats(season) {
  const key = `stats:${season}`;
  const hit = cached(key);
  if (hit) return hit;

  const urls = [
    `https://api.sleeper.app/stats/nfl/regular/${season}`,
    `https://api.sleeper.com/stats/nfl/${season}?season_type=regular`,
  ];
  let lastErr;
  for (const url of urls) {
    try {
      const payload = await getJson(url, 18000);
      return put(key, normalizeStatsPayload(payload), TTL.stats);
    } catch (e) {
      lastErr = e;
    }
  }
  console.warn("Stats source unavailable:", lastErr?.message || lastErr);
  return put(key, {}, TTL.stats);
}

async function getFantasyCalc({ dynasty, qbs, teams, ppr }) {
  const key = `fc:${dynasty}:${qbs}:${teams}:${ppr}`;
  const hit = cached(key);
  if (hit) return hit;
  const qs = new URLSearchParams({
    isDynasty: dynasty ? "true" : "false",
    numQbs: String(qbs),
    numTeams: String(teams),
    ppr: String(ppr),
  });
  const url = `https://api.fantasycalc.com/values/current?${qs.toString()}`;
  const data = await getJson(url, 15000);
  if (!Array.isArray(data)) throw new Error("FantasyCalc returned an unexpected response.");
  return put(key, data, TTL.values);
}

function fantasyPositions(p) {
  const arr = Array.isArray(p.fantasy_positions) ? p.fantasy_positions : [p.position];
  return arr.filter(Boolean);
}
function isFantasySkill(p) {
  return fantasyPositions(p).some(x => ["QB", "RB", "WR", "TE"].includes(x));
}

function espnHeadshot(espnId) {
  return espnId
    ? `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${espnId}.png&w=350&h=254`
    : null;
}
function sleeperHeadshot(id) {
  return id ? `https://sleepercdn.com/content/nfl/players/${id}.jpg` : null;
}
function nflProfile(name) {
  const slug = String(name || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `https://www.nfl.com/players/${slug}/`;
}

function statNum(stats, ...keys) {
  for (const key of keys) {
    const v = Number(stats?.[key]);
    if (Number.isFinite(v)) return v;
  }
  return 0;
}

function playerStatStrip(position, s = {}) {
  if (position === "QB") {
    return [
      [Math.round(statNum(s, "pass_yd")), "PASS YDS"],
      [Math.round(statNum(s, "pass_td")), "PASS TD"],
      [Math.round(statNum(s, "pass_int")), "INT"],
      [Math.round(statNum(s, "rush_yd")), "RUSH YDS"],
    ];
  }
  if (position === "RB") {
    return [
      [Math.round(statNum(s, "rush_att")), "CAR"],
      [Math.round(statNum(s, "rush_yd")), "RUSH YDS"],
      [Math.round(statNum(s, "rec")), "REC"],
      [Math.round(statNum(s, "rush_td") + statNum(s, "rec_td")), "TD"],
    ];
  }
  return [
    [Math.round(statNum(s, "rec")), "REC"],
    [Math.round(statNum(s, "rec_yd")), "REC YDS"],
    [Math.round(statNum(s, "rec_td")), "TD"],
    [Math.round(statNum(s, "rec_tgt")), "TGT"],
  ];
}

function productionMetric(position, s = {}) {
  // Use Sleeper's PPR rollup if present, otherwise a simple fantasy-points approximation.
  const direct = statNum(s, "pts_ppr", "fantasy_points_ppr");
  if (direct > 0) return direct;
  return (
    statNum(s, "pass_yd") / 25 +
    statNum(s, "pass_td") * 4 -
    statNum(s, "pass_int") * 2 +
    statNum(s, "rush_yd") / 10 +
    statNum(s, "rush_td") * 6 +
    statNum(s, "rec") +
    statNum(s, "rec_yd") / 10 +
    statNum(s, "rec_td") * 6
  );
}

function loadFallback() {
  return JSON.parse(fs.readFileSync(FALLBACK_FILE, "utf8"));
}

async function buildCatalog(params) {
  const state = await getState();
  const season = String(params.season || state.season || new Date().getFullYear());
  const key = `catalog:${season}:${params.dynasty}:${params.qbs}:${params.teams}:${params.ppr}`;
  const hit = cached(key);
  if (hit) return hit;

  let sleeper = {};
  let stats = {};
  let values = [];
  const sourceStatus = { fantasyCalc: false, sleeperPlayers: false, sleeperStats: false };

  try {
    sleeper = await getSleeperPlayers();
    sourceStatus.sleeperPlayers = true;
  } catch (e) {
    console.warn("Sleeper players failed:", e.message);
  }
  try {
    stats = await getSeasonStats(season);
    sourceStatus.sleeperStats = Object.keys(stats).length > 0;
  } catch (e) {
    console.warn("Sleeper stats failed:", e.message);
  }
  try {
    values = await getFantasyCalc(params);
    sourceStatus.fantasyCalc = true;
  } catch (e) {
    console.warn("FantasyCalc failed:", e.message);
  }

  if (!sourceStatus.fantasyCalc && !sourceStatus.sleeperPlayers) {
    const fallback = loadFallback();
    return put(key, {
      season,
      week: state.week || state.display_week || null,
      updatedAt: new Date().toISOString(),
      live: false,
      sourceStatus,
      players: fallback.players,
    }, TTL.catalog);
  }

  const fcBySleeper = new Map();
  const fcByName = new Map();
  for (const row of values) {
    const p = row.player || {};
    if (p.sleeperId) fcBySleeper.set(String(p.sleeperId), row);
    if (p.name) fcByName.set(p.name.toLowerCase(), row);
  }

  const merged = [];
  const usedNames = new Set();

  // First: all active fantasy players from Sleeper.
  for (const [id, sp] of Object.entries(sleeper || {})) {
    if (!sp || !isFantasySkill(sp)) continue;
    const position = fantasyPositions(sp).find(x => ["QB", "RB", "WR", "TE"].includes(x));
    const name = sp.full_name || [sp.first_name, sp.last_name].filter(Boolean).join(" ");
    if (!name || !position) continue;

    const fc = fcBySleeper.get(String(id)) || fcByName.get(name.toLowerCase());
    const st = stats[String(id)] || {};
    const marketValue = Number(fc?.value || 0);
    const trend30Day = Number(fc?.trend30Day || 0);

    merged.push({
      id: String(id),
      name,
      position,
      team: sp.team || fc?.player?.maybeTeam || "FA",
      age: sp.age ?? fc?.player?.maybeAge ?? null,
      status: sp.status || (sp.active ? "Active" : null),
      injuryStatus: sp.injury_status || null,
      marketValue,
      trend30Day,
      overallRank: fc?.overallRank ?? null,
      positionRank: fc?.positionRank ?? null,
      espnId: String(sp.espn_id || fc?.player?.espnId || ""),
      headshot: espnHeadshot(sp.espn_id || fc?.player?.espnId) || sleeperHeadshot(id),
      fallbackHeadshot: sleeperHeadshot(id),
      profile: nflProfile(name),
      stats: playerStatStrip(position, st),
      production: productionMetric(position, st),
      source: {
        value: fc ? "FantasyCalc" : "Model only",
        stats: Object.keys(st).length ? "Sleeper" : "Unavailable",
        image: (sp.espn_id || fc?.player?.espnId) ? "ESPN" : "Sleeper",
      }
    });
    usedNames.add(name.toLowerCase());
  }

  // Then: FantasyCalc-ranked players not present in active Sleeper pool.
  for (const row of values) {
    const p = row.player || {};
    const name = p.name;
    if (!name || usedNames.has(name.toLowerCase())) continue;
    if (!["QB", "RB", "WR", "TE"].includes(p.position)) continue;
    const id = String(p.sleeperId || `fc-${p.id}`);
    const st = stats[String(p.sleeperId || "")] || {};
    merged.push({
      id,
      name,
      position: p.position,
      team: p.maybeTeam || "FA",
      age: p.maybeAge ?? null,
      status: null,
      injuryStatus: null,
      marketValue: Number(row.value || 0),
      trend30Day: Number(row.trend30Day || 0),
      overallRank: row.overallRank ?? null,
      positionRank: row.positionRank ?? null,
      espnId: String(p.espnId || ""),
      headshot: espnHeadshot(p.espnId) || sleeperHeadshot(p.sleeperId),
      fallbackHeadshot: sleeperHeadshot(p.sleeperId),
      profile: nflProfile(name),
      stats: playerStatStrip(p.position, st),
      production: productionMetric(p.position, st),
      source: {
        value: "FantasyCalc",
        stats: Object.keys(st).length ? "Sleeper" : "Unavailable",
        image: p.espnId ? "ESPN" : "Sleeper",
      }
    });
  }

  // Normalize our model score.
  const maxMarket = Math.max(1, ...merged.map(p => p.marketValue));
  const maxProdByPos = {};
  for (const p of merged) maxProdByPos[p.position] = Math.max(maxProdByPos[p.position] || 1, p.production || 0);

  for (const p of merged) {
    const market = p.marketValue > 0 ? p.marketValue / maxMarket : 0;
    const prod = Math.max(0, Math.min(1, (p.production || 0) / (maxProdByPos[p.position] || 1)));
    const trend = Math.max(-1, Math.min(1, p.trend30Day / Math.max(1, maxMarket * 0.10)));
    let score = (0.75 * market + 0.20 * prod + 0.05 * ((trend + 1) / 2)) * 100;
    if (!p.marketValue) score = Math.min(24, 5 + prod * 19);
    p.modelScore = Math.max(1, Math.round(score));
  }

  merged.sort((a, b) =>
    b.modelScore - a.modelScore ||
    b.marketValue - a.marketValue ||
    a.name.localeCompare(b.name)
  );

  return put(key, {
    season,
    week: state.week || state.display_week || null,
    updatedAt: new Date().toISOString(),
    live: sourceStatus.fantasyCalc || sourceStatus.sleeperPlayers,
    sourceStatus,
    methodology: {
      marketWeight: 0.75,
      productionWeight: 0.20,
      trendWeight: 0.05,
      packageWeights: [1.00, 0.94, 0.88, 0.82]
    },
    players: merged,
  }, TTL.catalog);
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function serveStatic(reqPath, res) {
  let p = reqPath === "/" ? "/index.html" : reqPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, p));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); return res.end("Not Found");
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
    }[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (u.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, version: "9.0.0", time: new Date().toISOString() });
    }
    if (u.pathname === "/api/catalog") {
      const dynasty = u.searchParams.get("dynasty") === "true";
      const qbs = u.searchParams.get("qbs") === "2" ? 2 : 1;
      const teamsRaw = Number(u.searchParams.get("teams") || 12);
      const teams = [10, 12, 14].includes(teamsRaw) ? teamsRaw : 12;
      const pprRaw = Number(u.searchParams.get("ppr") ?? 1);
      const ppr = [0, 0.5, 1].includes(pprRaw) ? pprRaw : 1;
      const season = u.searchParams.get("season") || undefined;
      try {
        const catalog = await buildCatalog({ dynasty, qbs, teams, ppr, season });
        return sendJson(res, 200, catalog);
      } catch (e) {
        console.error(e);
        return sendJson(res, 500, { error: "Unable to build live catalog.", detail: e.message });
      }
    }
    serveStatic(u.pathname, res);
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: "Server error", detail: e.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`NFL Trade Lab running on port ${PORT}`);
});
