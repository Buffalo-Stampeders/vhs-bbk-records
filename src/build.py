#!/usr/bin/env python3
"""Build index.html from src/template.html + data/records_baseline.json + sync/records_engine.js.
Run from the repo root: python3 src/build.py
"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
data = json.load(open(root / 'data/records_baseline.json'))
j = json.dumps(data, separators=(',', ':')).replace('</', '<\\/')
eng = (root / 'sync/records_engine.js').read_text().replace('</script', '<\\/script')
page = (root / 'src/template.html').read_text().replace('__DATA__', j).replace('__ENGINE__', eng)
doc = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
       '<style>html{color-scheme:light dark}img{max-width:100%}[hidden]{display:none!important}</style>\n'
       '</head>\n<body>\n' + page + '\n</body>\n</html>\n')
(root / 'index.html').write_text(doc)
print('wrote index.html', len(doc) // 1024, 'KB')
