// VHS Boys Basketball — MaxPreps season scraper.
// Runs inside a Chrome tab that is on www.maxpreps.com (same-origin fetches).
// Usage: set window.__SEASON = '26-27' (MaxPreps year label) before running, or it defaults
// to the season implied by today's date (Nov 1 – Apr 1 belongs to that winter season).
// Returns a JSON string with players, games (incl. box scores), team totals and W-L.
window.__SCRAPE = (async () => {
  const TEAM_ID = '922fdc43-9bb8-4a00-af3c-bd6cb0882d04';
  const TEAM_SLUG = 'the-villages-charter-buffalo';
  const API = 'https://production.api.maxpreps.com/gatewayweb/react/';
  const BASE = 'https://www.maxpreps.com/fl/the-villages/the-villages-charter-buffalo/basketball/';

  const today = new Date();
  const yy = y => String(y).slice(-2);
  const impliedYear = today.getMonth() >= 10 ? today.getFullYear() : today.getFullYear() - 1; // Nov/Dec -> this year
  const SEASON = window.__SEASON || `${yy(impliedYear)}-${yy(impliedYear + 1)}`;
  const seasonLong = `20${SEASON.slice(0, 2)}-20${SEASON.slice(3, 5)}`;

  const j = async u => { const r = await fetch(u, { credentials: 'omit' }); if (!r.ok) return { data: null, status: r.status }; return r.json(); };
  const t = async u => { const r = await fetch(u); if (!r.ok) throw new Error(r.status + ' ' + u); return r.text(); };
  const num = v => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n; };

  // 1. season id
  const seasons = (await j(API + 'schedule-seasons/v1?teamId=' + TEAM_ID + '&sportSeasonId=a5dadf08-21fb-4889-bd84-1d0c6816e29a')).data || [];
  let season = seasons.find(s => s.year === SEASON);
  if (!season) {
    // the in-progress season is not in that list yet: read its id from the season's own stats page (tracking ssid)
    const ph = await t(BASE + SEASON + '/stats/');
    const title = (ph.match(/<title[^>]*>([^<]*)/) || ['', ''])[1];
    const sid = (ph.match(/ssid=([0-9a-f]{8}-[0-9a-f-]{27})/) || [])[1] || (ph.match(/"ssid":"([0-9a-f]{8}-[0-9a-f-]{27})"/) || [])[1];
    if (title.includes(SEASON) && sid) season = { year: SEASON, sportSeasonId: sid };
  }
  if (!season) throw new Error('Season ' + SEASON + ' not on MaxPreps. Have: ' + seasons.map(s => s.year).join(','));
  const SID = season.sportSeasonId;
  const Q = '?teamId=' + TEAM_ID + '&sportSeasonId=' + SID;

  // helper: stats block -> array of row objects keyed by column name
  const rowsOf = stats => {
    const cols = stats.columns.map(c => c.name);
    return stats.rows.map(r => { const o = {}; r.columns.forEach((c, i) => { o[cols[i]] = c.value; if (c.href) o[cols[i] + '_href'] = c.href; if (c.caption) o[cols[i] + '_caption'] = c.caption; }); return o; });
  };
  const overall = stats => { const o = {}; stats.columns.forEach(c => { if (c.overallValue != null) o[c.name] = c.overallValue; }); return o; };
  const findGroup = (d, name) => d.groups.find(g => g.name === name);

  // 2. roster full names
  const names = {}; // slug -> {full, cls}
  try {
    const rh = await t(BASE + SEASON + '/roster/');
    const re = /athletes\/([a-z0-9-]+)\/\?[^"]*","[^"]*","([^"]+)","[^"]*",(?:null|\d+),"([A-Za-z.]*)"\]/g;
    let m; while ((m = re.exec(rh))) names[m[1]] = { full: m[2], cls: m[3] };
    if (!Object.keys(names).length) { const re2 = /athletes\/([a-z0-9-]+)\/","[^"]*","([^"]+)","[^"]*",(?:null|\d+),"([A-Za-z.]*)"\]/g; while ((m = re2.exec(rh))) names[m[1]] = { full: m[2], cls: m[3] }; }
  } catch (e) { /* fall back to slug names */ }
  const slugOf = href => (href || '').match(/athletes\/([a-z0-9-]+)\//)?.[1] || null;
  const fullName = (abbrev, href) => {
    const slug = slugOf(href);
    if (slug && names[slug]) return names[slug].full;
    if (slug) { const first = slug.split('-')[0]; return first[0].toUpperCase() + first.slice(1) + ' ' + abbrev.replace(/^[A-Z]+\.\s*/, ''); }
    return abbrev;
  };

  // 3. player season totals
  let players = [];
  const ps = (await j(API + 'team-season-player-stats/rollup/v1' + Q)).data;
  let teamTotals = {};
  if (ps && ps.groups) {
    // merge every group/subgroup by player name (group titles differ between seasons; column names do not)
    const byName = {}, order = [], o = {};
    ps.groups.forEach(g => (g.subgroups || []).forEach(sg => {
      rowsOf(sg.stats).forEach(r => { if (!byName[r.Name]) { byName[r.Name] = {}; order.push(r.Name); } Object.assign(byName[r.Name], r); });
      Object.assign(o, overall(sg.stats));
    }));
    players = order.map(n => { const r = byName[n]; return {
        abbrev: r.Name, name: fullName(r.Name, r.Name_href), slug: slugOf(r.Name_href), cls: (r.Name_caption || '').replace(/[()]/g, ''), jersey: r.Jersey,
        gp: num(r.GamesPlayed), pts: num(r.Points), reb: num(r.Rebounds), oreb: num(r.OffensiveRebounds), dreb: num(r.DefensiveRebounds),
        ast: num(r.Assists), stl: num(r.Steals), blk: num(r.BlockedShots), to: num(r.Turnovers), pf: num(r.PersonalFouls),
        fgm: num(r.FieldGoalsMade), fga: num(r.FieldGoalAttempts), fg3m: num(r.ThreePointsMade), fg3a: num(r.ThreePointAttempts),
        ftm: num(r.FreeThrowsMade), fta: num(r.FreeThrowAttempts), charges: num(r.Charges), dd: num(r.DoubleDouble), td: num(r.TripleDouble)
      }; });
    teamTotals = { gp: num(o.GamesPlayed), pts: num(o.Points), reb: num(o.Rebounds), ast: num(o.Assists), stl: num(o.Steals), blk: num(o.BlockedShots), fgm: num(o.FieldGoalsMade), fga: num(o.FieldGoalAttempts), fg3m: num(o.ThreePointsMade), fg3a: num(o.ThreePointAttempts), ftm: num(o.FreeThrowsMade), fta: num(o.FreeThrowAttempts), charges: num(o.Charges) };
  }

  // 4. team game-by-game stats
  const games = {};
  const gs = (await j(API + 'team-season-game-stats/rollup/v1' + Q)).data;
  const gameKey = r => (r.Result_href || '').match(/c=([0-9a-f-]{36})/)?.[1] || (r.Date + '|' + r.Opponent);
  if (gs && gs.groups) {
    gs.groups.forEach(g => g.subgroups.forEach(sg => rowsOf(sg.stats).forEach(r => {
      const k = gameKey(r); const o = games[k] || (games[k] = { id: k, team: {} });
      o.dateRaw = r.Date; o.resultRaw = r.Result; o.oppRaw = r.Opponent; o.gameHref = r.Result_href || o.gameHref;
      Object.entries(r).forEach(([c, v]) => { if (!/^(Date|Result|Opponent)/.test(c) && !/_href|_caption/.test(c)) o.team[c] = v; });
    })));
  }

  // 5. schedule page: game types (*, **, ***), site, final scores, box score links
  const sh = await t(BASE + SEASON + '/schedule/');
  const sdoc = new DOMParser().parseFromString(sh, 'text/html');
  const sched = [...sdoc.querySelectorAll('table tbody tr')].map(tr => {
    const td = [...tr.querySelectorAll('td')]; if (td.length < 3) return null;
    const oppCell = td[1];
    const cellText = oppCell.textContent.replace(/\s+/g, ' ').trim();
    const stars = (cellText.match(/\*+$/) || [''])[0];
    const leaf = [...oppCell.querySelectorAll('*')].filter(e => !e.children.length).map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const site = leaf.includes('@') ? 'away' : leaf.includes('N') ? 'neutral' : 'home';
    const cands = leaf.filter(x => !['@', 'vs', 'N'].includes(x) && !/^\*+$/.test(x)).map(x => x.replace(/^(@|vs)\s*/, '').replace(/\*+$/, '').trim()).filter(Boolean);
    const opp = (cands.sort((a, b) => b.length - a.length)[0] || cellText.replace(/^(@|vs)\s*/, '').replace(/\*+$/, '')).trim();
    const res = td.map(x => x.textContent.trim()).find(x => /^[WL]\s+\d+-\d+/.test(x)) || '';
    const box = [...tr.querySelectorAll('a')].map(a => a.getAttribute('href')).find(h => /\/game\//.test(h)) || null;
    const id = (box || '').match(/c=([0-9a-f-]{36})/)?.[1] || null;
    const urlDate = (box || '').match(/\/(\d{1,2})-(\d{1,2})-(\d{4})\//);
    const date = urlDate ? `${urlDate[3]}-${urlDate[1].padStart(2, '0')}-${urlDate[2].padStart(2, '0')}` : null;
    const md = (td[0].textContent.trim().match(/^(\d{1,2}\/\d{1,2})/) || [''])[0];
    return { date, md, opp, site, stars, res, box, id };
  }).filter(Boolean);

  // date -> ISO. Nov/Dec = first year of season, Jan–Apr = second
  const y1 = 2000 + Number(SEASON.slice(0, 2)), y2 = y1 + 1;
  const iso = md => { const [m, d] = md.split('/').map(Number); if (!m) return null; const y = m >= 7 ? y1 : y2; return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };

  // 6. box scores per game (only completed games with a box link)
  const parseBox = html => {
    // flight data has escaped JSON; find every stats block with a Jersey column and keep rows for our athletes
    const s = html.replace(/\\"/g, '"');
    const out = [];
    let idx = 0;
    while ((idx = s.indexOf('{"columns":[{"name":"Jersey"', idx)) !== -1) {
      // balanced-brace scan
      let depth = 0, i = idx, inStr = false;
      for (; i < s.length; i++) { const ch = s[i]; if (inStr) { if (ch === '\\') { i++; continue; } if (ch === '"') inStr = false; continue; } if (ch === '"') inStr = true; else if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { i++; break; } } }
      try { const blk = JSON.parse(s.slice(idx, i)); out.push(blk); } catch (e) { }
      idx = i;
    }
    const byPlayer = {};
    out.forEach(blk => rowsOf(blk).forEach(r => { if (!(r.Name_href || '').includes(TEAM_SLUG)) return; const k = r.Name; byPlayer[k] = Object.assign(byPlayer[k] || {}, r); }));
    return Object.values(byPlayer).map(r => ({
      abbrev: r.Name, name: fullName(r.Name, r.Name_href), slug: slugOf(r.Name_href),
      pts: num(r.Points), fgm: num(r.FieldGoalsMade), fga: num(r.FieldGoalAttempts), fg3m: num(r.ThreePointsMade), fg3a: num(r.ThreePointAttempts),
      ftm: num(r.FreeThrowsMade), fta: num(r.FreeThrowAttempts), reb: num(r.Rebounds), ast: num(r.Assists), stl: num(r.Steals), blk: num(r.BlockedShots), charges: num(r.Charges)
    })).filter(p => p.pts != null || p.reb != null);
  };

  const cache = window.__BOX_CACHE || (window.__BOX_CACHE = {});
  const result = [];
  for (const g of sched) {
    const m = g.res.match(/^([WL])\s+(\d+)-(\d+)/);
    if (!m) continue; // not played yet
    const tg = (g.id && games[g.id]) || null;
    const hi = Number(m[2]), lo = Number(m[3]);
    const us = m[1] === 'W' ? hi : lo, them = m[1] === 'W' ? lo : hi;
    let box = [];
    if (g.box && !window.__NO_BOX) {
      try { if (!cache[g.id]) cache[g.id] = parseBox(await t(g.box.startsWith('http') ? g.box : 'https://www.maxpreps.com' + g.box.replace(/#.*$/, '') + (g.box.includes('?') ? '&' : '?') + 'tab=Stats')); box = cache[g.id]; } catch (e) { box = []; }
    }
    const team = tg ? tg.team : {};
    result.push({
      id: g.id, date: g.date || iso(g.md), opponent: g.opp, site: g.site, result: m[1] === 'W' ? 'Won' : 'Lost', us, them, margin: us - them,
      type: g.stars === '*' ? 'district' : g.stars === '**' ? 'playoff' : g.stars === '***' ? 'tournament' : 'regular',
      team: { pts: num(team.Points), fgm: num(team.FieldGoalsMade), fga: num(team.FieldGoalAttempts), fg3m: num(team.ThreePointsMade), fg3a: num(team.ThreePointAttempts), ftm: num(team.FreeThrowsMade), fta: num(team.FreeThrowAttempts), reb: num(team.Rebounds), ast: num(team.Assists), stl: num(team.Steals), blk: num(team.BlockedShots), charges: num(team.Charges) },
      box
    });
  }
  const wins = result.filter(g => g.result === 'Won').length, losses = result.length - wins;
  return JSON.stringify({ season: seasonLong, seasonLabel: SEASON, sportSeasonId: SID, scrapedAt: new Date().toISOString(), record: { wins, losses }, teamTotals, players, games: result });
})();
// Hand-off: render the result into the page as gzip+base64 so get_page_text can carry it out of the browser.
(async () => {
  let payload, summary;
  try {
    const json = await window.__SCRAPE;
    const R = JSON.parse(json);
    const enc = new TextEncoder().encode(json);
    const cs = new CompressionStream('gzip'); const w = cs.writable.getWriter(); w.write(enc); w.close();
    const u8 = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    let bin = ''; for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    payload = btoa(bin);
    summary = `SYNC OK season=${R.season} record=${R.record.wins}-${R.record.losses} games=${R.games.length} players=${R.players.length} boxes=${R.games.filter(g => g.box.length).length} scrapedAt=${R.scrapedAt}`;
  } catch (e) { summary = 'SYNC FAILED ' + (e && e.message || e); payload = ''; }
  document.title = 'payload';
  document.body.innerHTML = '<article><h1>' + summary + '</h1><p id="payload">' + payload + '</p></article>';
  window.__SYNC_SUMMARY = summary;
})();
