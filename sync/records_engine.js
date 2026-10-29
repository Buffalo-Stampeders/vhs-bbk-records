// Records engine: merges MaxPreps season docs into the record-book baseline.
// Pure functions; works in browser and Node (module.exports guarded).
(function (root) {
  const SEC = { ind_game: 'ind_game', ind_season: 'ind_season', career: 'career', team_game: 'team_game', team_season: 'team_season', alltime: 'alltime', coaching: 'coaching' };

  const pct = (m, a) => (a ? m / a : null);
  const fmtPct = v => v == null ? '' : (v >= 1 ? '1.000' : v.toFixed(3).replace(/^0/, ''));
  const fmtAvg = v => v == null ? '' : (Math.round(v * 10) / 10).toFixed(1);
  const fmtDate = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return `${m}/${d}/${String(y).slice(-2)}`; };

  // category -> how to compute from a stat line. {key} numeric field, or fn(line)->value, plus formatting + minimum attempts
  const IND_GAME = {
    'Points': { key: 'pts' }, 'Field Goals Made': { key: 'fgm' }, 'Field Goals Attempted': { key: 'fga' },
    'Three-Pointers Made': { key: 'fg3m' }, 'Three-Pointers Attempted': { key: 'fg3a' },
    'Free Throws Made': { key: 'ftm' }, 'Free Throws Attempted': { key: 'fta' },
    'Rebounds': { key: 'reb' }, 'Assists': { key: 'ast' }, 'Steals': { key: 'stl' }, 'Blocks': { key: 'blk' }
  };
  const IND_SEASON = {
    'Points': { key: 'pts' }, 'Scoring Average': { fn: p => pct(p.pts, p.gp), fmt: fmtAvg, min: p => p.gp >= 1 },
    'Field Goals Made': { key: 'fgm' }, 'Field Goal Attempts': { key: 'fga' },
    'Field Goal Percentage (min. 100 attempts)': { fn: p => pct(p.fgm, p.fga), fmt: fmtPct, min: p => p.fga >= 100 },
    'Three-point Field Goals Made': { key: 'fg3m' }, 'Three-point Field Goals Attempted': { key: 'fg3a' },
    'Three-point Field Goal Pct. (min. 20 att.)': { fn: p => pct(p.fg3m, p.fg3a), fmt: fmtPct, min: p => p.fg3a >= 20 },
    'Free Throws Made': { key: 'ftm' }, 'Free Throws Attempted': { key: 'fta' },
    'Free Throw Percentage (min. 20)': { fn: p => pct(p.ftm, p.fta), fmt: fmtPct, min: p => p.fta >= 20 },
    'Rebounds': { key: 'reb' }, 'Rebound Average': { fn: p => pct(p.reb, p.gp), fmt: v => v == null ? '' : (Math.round(v * 100) / 100).toFixed(2), min: p => p.gp >= 1 },
    'Steals': { key: 'stl' }, 'Assists': { key: 'ast' }, 'Blocks': { key: 'blk' }
  };
  const CAREER = {
    'Points': { key: 'pts' }, 'Field Goals Made': { key: 'fgm' }, 'Field Goal Attempts': { key: 'fga' },
    'Three-point Field Goals Made': { key: 'fg3m' }, 'Three-point Field Goals Attempted': { key: 'fg3a' },
    'Free Throws Made': { key: 'ftm' }, 'Free Throws Attempted': { key: 'fta' },
    'Rebounds': { key: 'reb' }, 'Steals': { key: 'stl' }, 'Assists': { key: 'ast' }, 'Blocks': { key: 'blk' }, 'Career Wins': { key: 'wins' }
  };
  const TEAM_GAME = {
    'High Point Games': { fn: g => g.us }, 'Combined Points': { fn: g => g.us + g.them, result: true },
    'Biggest Victory': { fn: g => g.margin > 0 ? g.margin : null },
    'Field Goals Made': { fn: g => g.team.fgm }, 'Three-point Field Goals Made': { fn: g => g.team.fg3m },
    'Free Throws Made': { fn: g => g.team.ftm }, 'Free Throws Attempted': { fn: g => g.team.fta },
    'Rebounds': { fn: g => g.team.reb }, 'Assists': { fn: g => g.team.ast }
  };
  const TEAM_SEASON = {
    'Wins': { fn: (s, d) => s.record.wins },
    // District Wins, District Tournament Wins and State Tournament Games are entered by hand (MaxPreps game labels are not reliable).
    'Points': { fn: s => s.teamTotals.pts }, 'Scoring Average': { fn: s => pct(s.teamTotals.pts, s.teamTotals.gp), fmt: fmtAvg },
    'Field Goals Made': { fn: s => s.teamTotals.fgm }, 'Field Goals Attempted': { fn: s => s.teamTotals.fga },
    'Field Goal Percentage': { fn: s => pct(s.teamTotals.fgm, s.teamTotals.fga), fmt: fmtPct },
    'Three-point Field Goals Made': { fn: s => s.teamTotals.fg3m }, 'Three-point Field Goals Attempted': { fn: s => s.teamTotals.fg3a },
    'Three-point Field Goal Percentage': { fn: s => pct(s.teamTotals.fg3m, s.teamTotals.fg3a), fmt: fmtPct },
    'Free Throws Made': { fn: s => s.teamTotals.ftm }, 'Free Throws Attempted': { fn: s => s.teamTotals.fta },
    'Free Throw Percentage': { fn: s => pct(s.teamTotals.ftm, s.teamTotals.fta), fmt: fmtPct },
    'Rebounds': { fn: s => s.teamTotals.reb }, 'Steals': { fn: s => s.teamTotals.stl }, 'Assists': { fn: s => s.teamTotals.ast },
    'Blocks': { fn: s => s.teamTotals.blk }, 'Charges': { fn: s => s.teamTotals.charges }
  };

  // Parenthetical qualifiers are kept on purpose: 'First Academy (Leesburg)' and 'The First Academy (Orlando)' are different schools.
  const normOpp = s => String(s || '').toLowerCase().replace(/[’'.]/g, '').replace(/\b(academy|high school|hs|the)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  function seasonDerived(season, config) {
    const cutoff = (config && config.districtTourneyCutoff) || '02-13'; // MM-DD: playoff games before this are the district tournament
    const yr2 = season.season.split('-')[1];
    const cut = `${yr2}-${cutoff}`;
    let districtWins = 0, districtTourneyWins = 0, stateGames = 0;
    season.games.forEach(g => {
      if (g.type === 'district' && g.result === 'Won') districtWins++;
      if (g.type === 'playoff') {
        if (g.date && g.date < cut) { if (g.result === 'Won') { districtTourneyWins++; districtWins++; } }
        else stateGames++;
      }
    });
    return { districtWins, districtTourneyWins, stateGames };
  }

  // thresholds: min numeric value per (section|category) in baseline; count of entries
  function thresholds(baseline) {
    const t = {};
    baseline.forEach(r => {
      if (r.value == null) return; const k = r.section + '|' + r.category;
      const c = t[k] || (t[k] = { min: Infinity, n: 0 }); c.n++; if (r.value < c.min) c.min = r.value;
    });
    return t;
  }

  /**
   * baseline: record-book rows. seasons: array of scraped season docs (sorted by season asc). config: {bookThrough, headCoach, districtTourneyCutoff, opponentAliases}
   * returns { rows: live rows to merge, replace: [{section,category,season}] team-season rows superseded, notes: [] }
   */
  function computeLive(baseline, seasons, config) {
    config = config || {};
    const bookThrough = config.bookThrough || '2025-2026';
    const th = thresholds(baseline);
    const rows = [], notes = [];
    // player aliases: MaxPreps name -> book name; a 'season|name' key applies to one season only
    const pa = config.playerAliases || {};
    const fixName = (n, season) => pa[season + '|' + n] || pa[n] || n;
    seasons = seasons.map(s => Object.assign({}, s, {
      players: (s.players || []).map(p => Object.assign({}, p, { name: fixName(p.name, s.season) })),
      games: (s.games || []).map(g => Object.assign({}, g, { box: (g.box || []).map(b => Object.assign({}, b, { name: fixName(b.name, s.season) })) }))
    }));
    const live = seasons.filter(s => s.season > bookThrough); // seasons not yet in the book
    const qualifies = (sec, cat, v) => { const c = th[sec + '|' + cat]; return v != null && c && v >= c.min; };
    const push = r => rows.push(Object.assign({ live: true, order: 10000 + rows.length }, r));

    for (const s of live) {
      const seasonLabel = s.season;
      // individual single game
      s.games.forEach(g => g.box.forEach(b => {
        Object.entries(IND_GAME).forEach(([cat, def]) => {
          const v = b[def.key]; if (qualifies('ind_game', cat, v)) push({ section: 'ind_game', category: cat, value: v, value_text: String(v), player: b.name, date: g.date, date_text: fmtDate(g.date), season: seasonLabel, opponent: g.opponent });
        });
        const tens = ['pts', 'reb', 'ast', 'stl', 'blk'].filter(k => (b[k] || 0) >= 10);
        if (tens.length >= 3) { const lbl = { pts: 'points', reb: 'rebounds', ast: 'assists', stl: 'steals', blk: 'blocks' }; push({ section: 'ind_game', category: 'Triple Double', value: null, value_text: tens.map(k => b[k] + ' ' + lbl[k]).join('/'), player: b.name, date: g.date, date_text: fmtDate(g.date), season: seasonLabel, opponent: g.opponent }); }
      }));
      // individual season
      s.players.forEach(p => Object.entries(IND_SEASON).forEach(([cat, def]) => {
        if (def.min && !def.min(p)) return;
        const v = def.key ? p[def.key] : def.fn(p);
        if (qualifies('ind_season', cat, v)) push({ section: 'ind_season', category: cat, value: v, value_text: def.fmt ? def.fmt(v) : String(v), player: p.name, season: seasonLabel });
      }));
      // team game
      s.games.forEach(g => Object.entries(TEAM_GAME).forEach(([cat, def]) => {
        const v = def.fn(g); if (qualifies('team_game', cat, v)) push({ section: 'team_game', category: cat, value: v, value_text: String(v), opponent: g.opponent, date: g.date, date_text: fmtDate(g.date), season: seasonLabel, result: def.result ? g.result : null });
      }));
      // team season (present once a game has been played; replaces any baseline row for that season)
      const d = seasonDerived(s, config);
      if (s.games.length) Object.entries(TEAM_SEASON).forEach(([cat, def]) => {
        const v = def.fn(s, d); if (v == null) return;
        push({ section: 'team_season', category: cat, value: v, value_text: def.fmt ? def.fmt(v) : String(v), season: seasonLabel, replaces: true });
      });
    }

    // career: players on a live roster
    if (live.length) {
      const bySlug = {};
      seasons.forEach(s => { const w = s.record.wins; s.players.forEach(p => { if (!p.gp) return; const o = bySlug[p.slug || p.name] || (bySlug[p.slug || p.name] = { name: p.name, seasons: [], tot: {} }); o.seasons.push(s.season); Object.entries(p).forEach(([k, v]) => { if (typeof v === 'number') o.tot[k] = (o.tot[k] || 0) + v; }); o.tot.wins = (o.tot.wins || 0) + w; }); });
      const liveSet = new Set(live.flatMap(s => s.players.filter(p => p.gp).map(p => p.slug || p.name)));
      Object.entries(bySlug).forEach(([slug, o]) => {
        if (!liveSet.has(slug)) return;
        const first = o.seasons[0].slice(0, 4), last = o.seasons[o.seasons.length - 1].slice(-4);
        Object.entries(CAREER).forEach(([cat, def]) => {
          const bookRow = baseline.find(r => r.section === 'career' && r.category === cat && r.player === o.name);
          let v;
          if (bookRow && /-$/.test(bookRow.season)) {
            // open career in the book: add only the seasons after the book
            v = bookRow.value; live.forEach(s => { const p = s.players.find(p => p.name === o.name); if (cat === 'Career Wins') { if (p && p.gp) v += s.record.wins; } else if (p) v += (p[def.key] || 0); });
          } else if (bookRow) { return; } // closed career already in book
          else { v = o.tot[def.key]; }
          if (qualifies('career', cat, v)) push({ section: 'career', category: cat, value: v, value_text: String(v), player: o.name, season: `${bookRow ? bookRow.season.replace(/-$/, '') : first}-`, replacesPlayer: !!bookRow });
        });
      });
    }

    // all-time vs: add live results to book rows
    const aliases = Object.assign({}, config.opponentAliases || {});
    const bookOpp = {}; baseline.filter(r => r.section === 'alltime').forEach(r => { bookOpp[normOpp(r.opponent)] = r; });
    const tally = {};
    live.forEach(s => s.games.forEach(g => {
      const key = normOpp(aliases[g.opponent] || aliases[normOpp(g.opponent)] || g.opponent);
      const t = tally[key] || (tally[key] = { w: 0, l: 0, name: g.opponent }); if (g.result === 'Won') t.w++; else t.l++;
    }));
    Object.entries(tally).forEach(([key, t]) => {
      const b = bookOpp[key];
      const w = (b ? b.wins : 0) + t.w, l = (b ? b.losses : 0) + t.l;
      push({ section: 'alltime', category: 'All-Time Record vs.', opponent: b ? b.opponent : t.name, wins: w, losses: l, games: w + l, pct: Math.round(w / (w + l) * 1000) / 1000, value: w, value_text: `${w}-${l}`, replacesOpponent: !!b, unmatched: !b });
      if (!b) notes.push(`New opponent "${t.name}" not found in the record book — verify the name (add an alias in config if it is an existing opponent).`);
    });

    // coaching
    if (live.length && config.headCoach) {
      const b = baseline.find(r => r.section === 'coaching' && r.category === 'Coaching Record' && r.coach === config.headCoach);
      let w = b ? b.wins : 0, l = b ? b.losses : 0; live.forEach(s => { w += s.record.wins; l += s.record.losses; });
      push({ section: 'coaching', category: 'Coaching Record', coach: config.headCoach, season: b ? b.season : live[0].season.slice(0, 4) + '-Present', wins: w, losses: l, value: w, value_text: `${w}-${l}`, pct: Math.round(w / (w + l) * 1000) / 1000, replacesCoach: true });
    }
    return { rows, notes, liveSeasons: live.map(s => s.season) };
  }

  /** Merge: returns full row list (baseline + live) with superseded baseline rows removed, sorted per list by value desc (book order for ties). */
  function merge(baseline, liveResult) {
    const live = liveResult.rows;
    const drop = new Set();
    live.forEach(r => {
      if (r.replaces) baseline.forEach((b, i) => { if (b.section === r.section && b.category === r.category && b.season === r.season) drop.add(i); });
      if (r.replacesPlayer) baseline.forEach((b, i) => { if (b.section === r.section && b.category === r.category && b.player === r.player) drop.add(i); });
      if (r.replacesOpponent) baseline.forEach((b, i) => { if (b.section === 'alltime' && b.opponent === r.opponent) drop.add(i); });
      if (r.replacesCoach) baseline.forEach((b, i) => { if (b.section === 'coaching' && b.category === 'Coaching Record' && b.coach === r.coach) drop.add(i); });
    });
    const all = baseline.filter((b, i) => !drop.has(i)).concat(live);
    // re-rank lists that received live rows (value desc; book order for ties). Season-ordered lists (team_season) keep season desc.
    const touched = new Set(live.map(r => r.section + '|' + r.category));
    const groups = {}; all.forEach(r => { const k = r.section + '|' + r.category; (groups[k] || (groups[k] = [])).push(r); });
    const out = [];
    Object.entries(groups).forEach(([k, rows]) => {
      if (touched.has(k)) {
        const sec = rows[0].section;
        if (sec === 'alltime') rows.sort((a, b) => a.opponent.localeCompare(b.opponent));
        else if (sec === 'team_season' && (rows[0].category.includes('Championship'))) rows.sort((a, b) => String(b.season).localeCompare(String(a.season)));
        else if (sec === 'coaching') { /* keep */ }
        else rows.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity) || (a.order - b.order));
      }
      rows.forEach((r, i) => { r.rank = i + 1; out.push(r); });
    });
    return out;
  }

  const api = { computeLive, merge, seasonDerived, thresholds, normOpp, fmtDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RecordsEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
