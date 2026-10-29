import json, re, sys
from docx import Document

SRC = sys.argv[1]
doc = Document(SRC)
paras = []
for p in doc.paragraphs:
    t = p.text.replace('\u00a0', ' ').rstrip()
    if not t.strip(): continue
    bold = all((r.bold or p.style.font.bold) for r in p.runs if r.text.strip())
    paras.append(('**' + t.strip()) if bold else t)

# Top-level sections, in document order
SECTION_MARKERS = [
    ("Individual Top Single Game", "ind_game"),
    ("Top Single Season", "ind_season"),
    ("Career Records", "career"),
    ("Buffalo Team Records Single Game", "team_game"),
    ("Buffalo Team Records Season", "team_season"),
    ("All Time Record", "alltime"),
    ("Coaching History", "coaching"),
]

def norm_stat(s):
    s = s.strip().rstrip(':').strip()
    s = re.sub(r'\s+', ' ', s)
    return s

records = []
section = None
stat = None
coach_sub = None
order = 0

def split_fields(line):
    # fields are tab separated, sometimes with runs of spaces
    parts = [x.strip() for x in re.split(r'\t+|\s{3,}', line.strip()) if x.strip()]
    return parts

def parse_date(d):
    m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{2,4})$', d.strip())
    if not m: return None, None
    mo, da, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if yr < 100: yr += 2000
    # season: Nov-Mar games; Nov/Dec belong to season yr-(yr+1)
    season = f"{yr}-{yr+1}" if mo >= 7 else f"{yr-1}-{yr}"
    return f"{yr:04d}-{mo:02d}-{da:02d}", season

for raw in paras:
    line = raw.strip()
    if line.startswith('**'):
        txt = line.lstrip('*').strip()
        matched = False
        for marker, key in SECTION_MARKERS:
            if txt.startswith(marker):
                section = key; stat = ('All-Time Record vs.' if key=='alltime' else None); coach_sub = None; matched = True; break
        if matched: continue
        if section is not None:
            stat = norm_stat(txt)
        continue
    if section is None or stat is None:
        continue
    order += 1
    fields = split_fields(line)
    if section in ('ind_game',):
        if stat.startswith('Triple'):
            # "20 points/10 rebounds/12 assists  Name  date"
            m = re.match(r'(.+?)\s{2,}|(.+?)\t', line)
            value, player, date = fields[0], fields[1], fields[2]
            iso, season = parse_date(date)
            records.append(dict(section=section, category='Triple Double', value_text=value, value=None,
                                player=player, date=iso, date_text=date, season=season, order=order))
        else:
            if len(fields) < 3: print('SKIP', section, stat, repr(line)); continue
            value, player, date = fields[0], fields[1], fields[2]
            iso, season = parse_date(date)
            records.append(dict(section=section, category=stat, value=float(value), value_text=value,
                                player=player, date=iso, date_text=date, season=season, order=order))
    elif section in ('ind_season', 'career'):
        if len(fields) < 3: print('SKIP', section, stat, repr(line)); continue
        value, player, span = fields[0], fields[1], fields[2]
        records.append(dict(section=section, category=stat, value=float(value), value_text=value,
                            player=player, season=span, order=order))
    elif section == 'team_game':
        # "117  vs. Seffner Christian  12/27/19  [Won]"
        value = fields[0]
        opp = re.sub(r'^vs\.?\s*', '', fields[1]).strip()
        date = fields[2]
        result = fields[3] if len(fields) > 3 else None
        iso, season = parse_date(date)
        records.append(dict(section=section, category=stat, value=float(value), value_text=value,
                            opponent=opp, date=iso, date_text=date, season=season, result=result, order=order))
    elif section == 'team_season':
        if len(fields) == 1:
            # championship lists (season only) or "- 457" orphan rows
            if re.match(r'^\d{4}-\d{4}$', fields[0]):
                records.append(dict(section=section, category=stat, value=None, value_text='✓',
                                    season=fields[0], order=order))
            else:
                records.append(dict(section=section, category=stat, value=None, value_text=fields[0].lstrip('- ').strip(),
                                    season='(unlabeled)', order=order, note='season missing in source'))
            continue
        season, value = fields[0], fields[1]
        if season.startswith('-'):
            records.append(dict(section=section, category=stat, value=float(value), value_text=value,
                                season='(unlabeled)', order=order, note='season missing in source')); continue
        records.append(dict(section=section, category=stat, value=float(value), value_text=value,
                            season=season, order=order))
    elif section == 'alltime':
        m = re.match(r'(.+?)\s+(\d+)-(\d+)\s*$', line.strip())
        if not m: print('SKIP alltime', repr(line)); continue
        opp, w, l = m.group(1).strip(), int(m.group(2)), int(m.group(3))
        records.append(dict(section=section, category='All-Time Record vs.', opponent=opp, wins=w, losses=l,
                            value=w, value_text=f"{w}-{l}", games=w+l,
                            pct=round(w/(w+l), 3), order=order))
    elif section == 'coaching':
        if stat.startswith('Coaching Records'):
            # Name  years  W-L  pct
            m = re.match(r'(.+?)\s+(\d{4}(?:-\d{4}|-Present)?)\s+(\d+)-(\d+)\s+([\d.]+)', line.strip())
            if not m: print('SKIP coach', repr(line)); continue
            records.append(dict(section=section, category='Coaching Record', coach=m.group(1).strip(), season=m.group(2),
                                wins=int(m.group(3)), losses=int(m.group(4)), value=int(m.group(3)),
                                value_text=f"{m.group(3)}-{m.group(4)}", pct=float(m.group(5)), order=order))
        else:
            m = re.match(r'(.+?)\s*\((\d+)\)\s*$', line.strip())
            if m:
                coach_sub = m.group(1).strip()
                records.append(dict(section=section, category=stat, coach=coach_sub, value=int(m.group(2)),
                                    value_text=m.group(2), season='(total)', order=order))
            elif re.match(r'^\d{4}-\d{4}$', line.strip()):
                records.append(dict(section=section, category=stat, coach=coach_sub, value=None, value_text='✓',
                                    season=line.strip(), order=order))
            else:
                print('SKIP coach-sub', repr(line))

# fix obvious typos in source where unambiguous
for r in records:
    if r.get('season') == '2013-1014': r['season'] = '2013-2014'; r['note'] = 'source reads 2013-1014'
    if r.get('season') == '2012-2012' and r['category'].startswith('Scoring'): r['note'] = 'source reads 2012-2012'

json.dump(records, open(sys.argv[2], 'w'), indent=1)
from collections import Counter
c = Counter((r['section'], r['category']) for r in records)
for k, v in sorted(c): print(v, k)
print('TOTAL', len(records))
