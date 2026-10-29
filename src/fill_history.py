#!/usr/bin/env python3
"""Fill the record-book baseline from MaxPreps historical seasons.

Adds entries that qualify for a list (>= the list's lowest value, honoring minimum attempts) and are not
already in the book; labels '(unlabeled)' team-season rows when a season's MaxPreps value matches; adds
seasons missing from team-season lists; adds career totals for players missing from career lists.
Never changes an existing book value — discrepancies are written to a report instead.

usage: fill_history.py records.json seasons_all.json out_records.json report.md
"""
import json, sys, re, unicodedata
from collections import defaultdict

book = json.load(open(sys.argv[1]))
seasons = json.load(open(sys.argv[2]))
seasons = sorted(seasons.values() if isinstance(seasons, dict) else seasons, key=lambda s: s['season'])
NOTE = 'added 10/29/2026 from MaxPreps history (missing from 3.14.2026 book)'

# season completeness: MaxPreps team points must equal the book's team-season Points for that season
_book_pts = {r['season']: r['value'] for r in book if r['section']=='team_season' and r['category']=='Points'}
def complete(s):
    tp = (s.get('teamTotals') or {}).get('pts')
    return tp is not None and _book_pts.get(s['season']) is not None and abs(_book_pts[s['season']] - tp) < 0.5
COMPLETE = {s['season'] for s in seasons if complete(s)}
HAS_DATA = {s['season'] for s in seasons if s['players']}

def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'\(.*?\)', '', s); s = re.sub(r"[’'.]", '', s)
    s = re.sub(r'\b(academy|high school|hs|the|jr|ii|iii)\b', '', s)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

def pct(m, a): return (m / a) if a else None
def fmt_pct(v): return ('1.000' if v >= 1 else ('%.3f' % v)[1:])
def fmt_avg(v): return '%.1f' % (round(v * 10) / 10)
def fmt_avg2(v): return '%.2f' % (round(v * 100) / 100)
def mdy(iso): y, m, d = iso.split('-'); return f'{int(m)}/{int(d)}/{y[2:]}'

# ---------- category definitions (mirror records_engine.js) ----------
IND_GAME = {'Points': 'pts', 'Field Goals Made': 'fgm', 'Field Goals Attempted': 'fga', 'Three-Pointers Made': 'fg3m',
            'Three-Pointers Attempted': 'fg3a', 'Free Throws Made': 'ftm', 'Free Throws Attempted': 'fta',
            'Rebounds': 'reb', 'Assists': 'ast', 'Steals': 'stl', 'Blocks': 'blk'}
IND_SEASON = {
    'Points': (lambda p: p['pts'], str, None),
    'Scoring Average': (lambda p: pct(p['pts'], p['gp']), fmt_avg, lambda p: (p['gp'] or 0) >= 1),
    'Field Goals Made': (lambda p: p['fgm'], str, None), 'Field Goal Attempts': (lambda p: p['fga'], str, None),
    'Field Goal Percentage (min. 100 attempts)': (lambda p: pct(p['fgm'], p['fga']), fmt_pct, lambda p: (p['fga'] or 0) >= 100),
    'Three-point Field Goals Made': (lambda p: p['fg3m'], str, None), 'Three-point Field Goals Attempted': (lambda p: p['fg3a'], str, None),
    'Three-point Field Goal Pct. (min. 20 att.)': (lambda p: pct(p['fg3m'], p['fg3a']), fmt_pct, lambda p: (p['fg3a'] or 0) >= 20),
    'Free Throws Made': (lambda p: p['ftm'], str, None), 'Free Throws Attempted': (lambda p: p['fta'], str, None),
    'Free Throw Percentage (min. 20)': (lambda p: pct(p['ftm'], p['fta']), fmt_pct, lambda p: (p['fta'] or 0) >= 20),
    'Rebounds': (lambda p: p['reb'], str, None), 'Rebound Average': (lambda p: pct(p['reb'], p['gp']), fmt_avg2, lambda p: (p['gp'] or 0) >= 1),
    'Steals': (lambda p: p['stl'], str, None), 'Assists': (lambda p: p['ast'], str, None), 'Blocks': (lambda p: p['blk'], str, None)}
CAREER = {'Points': 'pts', 'Field Goals Made': 'fgm', 'Field Goal Attempts': 'fga', 'Three-point Field Goals Made': 'fg3m',
          'Three-point Field Goals Attempted': 'fg3a', 'Free Throws Made': 'ftm', 'Free Throws Attempted': 'fta',
          'Rebounds': 'reb', 'Steals': 'stl', 'Assists': 'ast', 'Blocks': 'blk', 'Career Wins': 'wins'}
TEAM_GAME = {'High Point Games': lambda g: g['us'], 'Combined Points': lambda g: g['us'] + g['them'],
             'Biggest Victory': lambda g: g['margin'] if g['margin'] > 0 else None,
             'Field Goals Made': lambda g: g['team']['fgm'], 'Three-point Field Goals Made': lambda g: g['team']['fg3m'],
             'Free Throws Made': lambda g: g['team']['ftm'], 'Free Throws Attempted': lambda g: g['team']['fta'],
             'Rebounds': lambda g: g['team']['reb'], 'Assists': lambda g: g['team']['ast']}
TEAM_SEASON = {
    # District Wins / District Tournament Wins / State Tournament Games are maintained by hand, never filled from MaxPreps.
    'Wins': (lambda s, d: s['record']['wins'], str),
    'Points': (lambda s, d: s['teamTotals'].get('pts'), str), 'Scoring Average': (lambda s, d: pct(s['teamTotals'].get('pts'), s['teamTotals'].get('gp')), fmt_avg),
    'Field Goals Made': (lambda s, d: s['teamTotals'].get('fgm'), str), 'Field Goals Attempted': (lambda s, d: s['teamTotals'].get('fga'), str),
    'Field Goal Percentage': (lambda s, d: pct(s['teamTotals'].get('fgm'), s['teamTotals'].get('fga')), fmt_pct),
    'Three-point Field Goals Made': (lambda s, d: s['teamTotals'].get('fg3m'), str), 'Three-point Field Goals Attempted': (lambda s, d: s['teamTotals'].get('fg3a'), str),
    'Three-point Field Goal Percentage': (lambda s, d: pct(s['teamTotals'].get('fg3m'), s['teamTotals'].get('fg3a')), fmt_pct),
    'Free Throws Made': (lambda s, d: s['teamTotals'].get('ftm'), str), 'Free Throws Attempted': (lambda s, d: s['teamTotals'].get('fta'), str),
    'Free Throw Percentage': (lambda s, d: pct(s['teamTotals'].get('ftm'), s['teamTotals'].get('fta')), fmt_pct),
    'Rebounds': (lambda s, d: s['teamTotals'].get('reb'), str), 'Steals': (lambda s, d: s['teamTotals'].get('stl'), str),
    'Assists': (lambda s, d: s['teamTotals'].get('ast'), str), 'Blocks': (lambda s, d: s['teamTotals'].get('blk'), str),
    'Charges': (lambda s, d: s['teamTotals'].get('charges'), str)}

def derived(s, cutoff='02-13'):
    yr2 = s['season'].split('-')[1]; cut = f'{yr2}-{cutoff}'
    dw = dtw = sg = 0
    for g in s['games']:
        if g['type'] == 'district' and g['result'] == 'Won': dw += 1
        if g['type'] == 'playoff':
            if g['date'] and g['date'] < cut:
                if g['result'] == 'Won': dtw += 1; dw += 1
            else: sg += 1
    return dict(districtWins=dw, districtTourneyWins=dtw, stateGames=sg)

# ---------- thresholds / indexes ----------
th = {}
for r in book:
    if r.get('value') is None: continue
    k = (r['section'], r['category']); th[k] = min(th.get(k, 1e9), r['value'])
def qual(sec, cat, v): return v is not None and (sec, cat) in th and v >= th[(sec, cat)] - 1e-9

book_players = {norm(r['player']): r['player'] for r in book if r.get('player')}
def book_name(name):
    n = norm(name)
    if n in book_players: return book_players[n]
    # last name + first initial match (e.g. "Tj Kennedy" vs "TJ Kennedy")
    parts = n.split()
    for bn, orig in book_players.items():
        bp = bn.split()
        if parts and bp and parts[-1] == bp[-1] and parts[0][0] == bp[0][0]: return orig
    return name

def has(sec, cat, **kw):
    for r in book:
        if r['section'] != sec or r['category'] != cat: continue
        ok = True
        for k, v in kw.items():
            rv = r.get(k)
            if k in ('player', 'opponent'): ok &= norm(rv) == norm(v)
            elif k == 'value': ok &= rv is not None and abs(rv - v) < 0.0051
            else: ok &= rv == v
        if ok: return r
    return None

from datetime import date as _date
def _days(a, b):
    try:
        y1, m1, d1 = map(int, a.split('-')); y2, m2, d2 = map(int, b.split('-'))
        return abs((_date(y1, m1, d1) - _date(y2, m2, d2)).days)
    except Exception: return 9999
def near_dup(sec, cat, v, iso, **who):
    for r in book:
        if r['section'] != sec or r['category'] != cat or r.get('value') is None or abs(r['value'] - v) > 0.5 or not r.get('date'): continue
        ok = all(norm(r.get(k)) == norm(val) for k, val in who.items())
        if not ok: continue
        same_md = r['date'][5:] == iso[5:] and abs(int(r['date'][:4]) - int(iso[:4])) == 1   # year typo
        close = _days(r['date'], iso) <= 31                                                   # day/month slip
        if same_md or close: return r
    return None
aliases = json.load(open('/home/claude/data/config_main.json'))['opponentAliases']
adds, report = [], defaultdict(list)
def add(row):
    row['note'] = NOTE; adds.append(row)

# ---------- individual single game ----------
for s in seasons:
    for g in s['games']:
        for b in g['box']:
            name = book_name(b['name'])
            for cat, key in IND_GAME.items():
                v = b.get(key)
                if not qual('ind_game', cat, v): continue
                ex = has('ind_game', cat, player=name, date=g['date'])
                if ex:
                    if abs(ex['value'] - v) >= 0.5: report['Single-game value differs'].append(f"{cat}: {name} {mdy(g['date'])} book {ex['value_text']} vs MaxPreps {v}")
                    continue
                nd = near_dup('ind_game', cat, v, g['date'], player=name)
                if nd:
                    report['Possible date typo in book (same player/value, date differs; not added)'].append(f"{cat}: {name} {v} — book {nd['date_text']} vs MaxPreps {mdy(g['date'])} (vs {g['opponent']})"); continue
                add(dict(section='ind_game', category=cat, value=v, value_text=str(v), player=name, date=g['date'], date_text=mdy(g['date']), season=s['season'], opponent=g['opponent']))
            tens = [k for k in ('pts', 'reb', 'ast', 'stl', 'blk') if (b.get(k) or 0) >= 10]
            if len(tens) >= 3 and not has('ind_game', 'Triple Double', player=name, date=g['date']):
                lbl = dict(pts='points', reb='rebounds', ast='assists', stl='steals', blk='blocks')
                add(dict(section='ind_game', category='Triple Double', value=None, value_text='/'.join(f"{b[k]} {lbl[k]}" for k in tens), player=name, date=g['date'], date_text=mdy(g['date']), season=s['season'], opponent=g['opponent']))

# ---------- individual season ----------
for s in seasons:
    if s['season'] not in COMPLETE:
        for p in s['players']:
            for cat, (fn, fmt, mn) in IND_SEASON.items():
                if mn and not mn(p): continue
                try: v = fn(p)
                except Exception: v = None
                if qual('ind_season', cat, v) and not has('ind_season', cat, player=book_name(p['name']), season=s['season']):
                    report['Season candidates from PARTIAL seasons (not added; MaxPreps has only some games)'].append(f"{cat}: {book_name(p['name'])} {s['season']} MaxPreps {fmt(v)} (partial)")
        continue
    for p in s['players']:
        name = book_name(p['name'])
        for cat, (fn, fmt, mn) in IND_SEASON.items():
            if mn and not mn(p): continue
            try: v = fn(p)
            except Exception: v = None
            if not qual('ind_season', cat, v): continue
            ex = has('ind_season', cat, player=name, season=s['season'])
            if ex:
                if abs(ex['value'] - v) > (0.0051 if ex['value'] < 2 else 0.5): report['Season value differs'].append(f"{cat}: {name} {s['season']} book {ex['value_text']} vs MaxPreps {fmt(v)}")
                continue
            add(dict(section='ind_season', category=cat, value=round(v, 3) if isinstance(v, float) else v, value_text=fmt(v), player=name, season=s['season']))

# ---------- team game ----------
for s in seasons:
    for g in s['games']:
        if norm(g['opponent']) in ('varsity opponent', 'opponent', 'tbd'): continue
        for cat, fn in TEAM_GAME.items():
            try: v = fn(g)
            except Exception: v = None
            if not qual('team_game', cat, v): continue
            ex = has('team_game', cat, date=g['date'])
            if ex:
                if abs(ex['value'] - v) >= 0.5: report['Team-game value differs'].append(f"{cat}: vs {g['opponent']} {mdy(g['date'])} book {ex['value_text']} vs MaxPreps {v}")
                continue
            nd = near_dup('team_game', cat, v, g['date'], opponent=aliases.get(g['opponent'], g['opponent']))
            if nd:
                report['Possible date typo in book (same opponent/value, date differs; not added)'].append(f"{cat}: vs {g['opponent']} {v} — book {nd['date_text']} vs MaxPreps {mdy(g['date'])}"); continue
            add(dict(section='team_game', category=cat, value=v, value_text=str(v), opponent=g['opponent'], date=g['date'], date_text=mdy(g['date']), season=s['season'], result=(g['result'] if cat == 'Combined Points' else None)))

# ---------- team season ----------
for s in seasons:
    if s['season'] not in COMPLETE: continue
    d = derived(s)
    for cat, (fn, fmt) in TEAM_SEASON.items():
        try: v = fn(s, d)
        except Exception: v = None
        if v is None: continue
        ex = has('team_season', cat, season=s['season'])
        if ex:
            if ex['value'] is not None and abs(ex['value'] - v) > (0.0051 if ex['value'] < 2 else 0.5): report['Team-season value differs'].append(f"{cat} {s['season']}: book {ex['value_text']} vs MaxPreps {fmt(v)}")
            continue
        # a season that appears twice in the list with this value is a mislabeled row: relabel it
        rows_cat = [r for r in book if r['section'] == 'team_season' and r['category'] == cat]
        dup_seasons = {r['season'] for r in rows_cat if sum(1 for x in rows_cat if x['season'] == r['season']) > 1}
        same = lambda r: r.get('value') is not None and (abs(r['value'] - v) < 0.0051 or r['value_text'].lstrip('.') == fmt(v).lstrip('.'))
        mis = next((r for r in rows_cat if r['season'] in dup_seasons and same(r)), None)
        if mis is None:
            mis = next((r for r in rows_cat if r['season'] == '2012-2012' and same(r)), None)
        if mis:
            report['Mislabeled team-season rows relabeled'].append(f"{cat}: {fmt(v)} was '{mis['season']}' -> {s['season']}")
            old = mis['season']; mis['season'] = s['season']; mis['note'] = f"season label corrected from '{old}' via MaxPreps"; continue
        if v == 0 or (not qual('team_season', cat, v)): continue
        # unlabeled row with this value? label it
        un = [r for r in book if r['section'] == 'team_season' and r['category'] == cat and r.get('season') == '(unlabeled)']
        hit = next((r for r in un if r['value_text'].lstrip('.') == fmt(v).lstrip('.') or (r.get('value') is not None and abs(r['value'] - v) < 0.0051)), None)
        if hit:
            hit['season'] = s['season']; hit['value'] = v; hit['note'] = 'season label restored from MaxPreps (blank in 3.14.2026 book)'
            report['Unlabeled rows labeled'].append(f"{cat}: {fmt(v)} -> {s['season']}"); continue
        if cat in ('District Championships', 'Region Championships'): continue
        add(dict(section='team_season', category=cat, value=v, value_text=fmt(v), season=s['season']))

# ---------- career ----------
tot = defaultdict(lambda: defaultdict(int)); spans = defaultdict(list); cls = defaultdict(dict)
ORDER = [s['season'] for s in seasons]
for s in seasons:
    for p in s['players']:
        if not p.get('gp'): continue
        name = book_name(p['name'])
        for k in ('pts', 'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta', 'reb', 'stl', 'ast', 'blk'): tot[name][k] += p.get(k) or 0
        tot[name]['wins'] += s['record']['wins']; spans[name].append(s['season']); cls[name][s['season']] = (p.get('cls') or '')
def career_ok(name):
    first, last = spans[name][0], spans[name][-1]
    i0, i1 = ORDER.index(first), ORDER.index(last)
    if any(ORDER[i] not in COMPLETE for i in range(i0, i1 + 1)): return False
    prev_ok = i0 == 0 or ORDER[i0 - 1] in COMPLETE or cls[name][first].startswith('Fr')
    nxt_ok = i1 == len(ORDER) - 1 or ORDER[i1 + 1] in COMPLETE or cls[name][last].startswith('Sr')
    return prev_ok and nxt_ok
for name, t in tot.items():
    active = spans[name][-1] == ORDER[-1] and not cls[name][spans[name][-1]].startswith('Sr')
    span = f"{spans[name][0][:4]}-" if active else f"{spans[name][0][:4]}-{spans[name][-1][-4:]}"
    if not career_ok(name):
        for cat, key in CAREER.items():
            if qual('career', cat, t[key]) and not has('career', cat, player=name):
                report['Career candidates with incomplete MaxPreps coverage (not added)'].append(f"{cat}: {name} MaxPreps sum {t[key]} over {spans[name][0]}..{spans[name][-1]}")
        continue
    for cat, key in CAREER.items():
        v = t[key]
        if not qual('career', cat, v): continue
        ex = has('career', cat, player=name)
        if ex:
            if abs(ex['value'] - v) >= 1 and not ex['season'].endswith('-'): report['Career value differs (book kept)'].append(f"{cat}: {name} book {ex['value_text']} ({ex['season']}) vs MaxPreps {v} ({span})")
            continue
        add(dict(section='career', category=cat, value=v, value_text=str(v), player=name, season=span))

# ---------- all-time vs ----------
tally = defaultdict(lambda: [0, 0, None])
for s in seasons:
    for g in s['games']:
        nm = aliases.get(g['opponent'], g['opponent']); k = norm(nm)
        tally[k][2] = nm; tally[k][0 if g['result'] == 'Won' else 1] += 1
book_opp = {norm(r['opponent']): r for r in book if r['section'] == 'alltime'}
for k, (w, l, nm) in tally.items():
    ex = book_opp.get(k)
    if ex:
        if ex['wins'] < w or ex['losses'] < l: report['All-time record lower in book than MaxPreps (book kept)'].append(f"{ex['opponent']}: book {ex['wins']}-{ex['losses']} vs MaxPreps {w}-{l}")
    else:
        report['All-time: opponent name not found in book (not added; check spelling/alias)'].append(f"{nm}: {w}-{l} (MaxPreps seasons only)")

# ---------- insert in order ----------
for row in adds:
    idx = [i for i, r in enumerate(book) if r['section'] == row['section'] and r['category'] == row['category']]
    if row['section'] == 'alltime':
        pos = next((i for i in idx if book[i]['opponent'].lower() > row['opponent'].lower()), idx[-1] + 1) if idx else len(book)
    elif row['value'] is None:
        pos = idx[-1] + 1 if idx else len(book)
    else:
        pos = idx[-1] + 1 if idx else len(book)
        for i in idx:
            if (book[i].get('value') or 0) < row['value']: pos = i; break
    book.insert(pos, row)
for i, r in enumerate(book): r['order'] = i + 1
json.dump(book, open(sys.argv[3], 'w'), indent=1)

with open(sys.argv[4], 'w') as f:
    f.write(f"# MaxPreps history fill — {len(adds)} entries added, book now {len(book)} rows\n\n")
    bysec = defaultdict(list)
    for a in adds: bysec[(a['section'], a['category'])].append(a)
    f.write('## Added\n')
    for (sec, cat), rows in sorted(bysec.items()):
        f.write(f"\n### {sec} · {cat} ({len(rows)})\n")
        for a in rows: f.write(f"- {a['value_text']} — {a.get('player') or a.get('opponent') or ''} {a.get('date_text') or a.get('season') or ''}\n")
    f.write('\n## Review (nothing changed in the book for these)\n')
    f.write('\nValue differences between the book and MaxPreps are intentionally ignored (historical MaxPreps inaccuracies; the book value stands) and are not listed.\n')
    for k, items in report.items():
        if 'value differs' in k: continue
        f.write(f"\n### {k} ({len(items)})\n")
        for it in items: f.write(f"- {it}\n")
print('complete seasons', sorted(COMPLETE)); print('added', len(adds), 'book', len(book))
for k, items in report.items(): print(k, len(items))
