#!/usr/bin/env python3
"""
Coverage runda 5: strippa dead CSS från cco-polish.css.

Identisk logik som strip-from-coverage.py men siktar på cco-polish.css
istället för styles.css. Skydd mot falska positiver:
- Bara ta bort regler där 0 byte används
- Skippa @media/@supports/@keyframes/@layer
- Skippa selektorer med :hover/:focus/:active/::before/::after osv.
- Skippa selektorer med dynamic state-classes (.is-, [data-...] som triggas)
"""
import json, re, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COVERAGE_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'coverage-output.json')
CSS_FILE = os.path.join(ROOT, 'public/major-arcana-preview/cco-polish.css')
OUT = '/tmp/cco-polish-stripped-r5.css'

with open(COVERAGE_JSON) as f:
    coverage = json.load(f)

target_entry = None
for c in coverage:
    if 'cco-polish.css' in c['url']:
        target_entry = c
        break
if not target_entry:
    print("ERROR: hittade ingen cco-polish.css i coverage-output", file=sys.stderr)
    sys.exit(1)

with open(CSS_FILE) as f:
    css = f.read()

if target_entry['textLength'] != len(css):
    print(f"VARNING: coverage-textLength={target_entry['textLength']} men file har {len(css)} chars", file=sys.stderr)
    print("(Rerun coverage-runner.js)", file=sys.stderr)
    sys.exit(2)

used_ranges = sorted(target_entry['ranges'], key=lambda r: r['start'])

def range_overlaps_used(start, end):
    for r in used_ranges:
        if r['end'] <= start: continue
        if r['start'] >= end: break
        return True
    return False

# Skydda interaktiva pseudo-classes
PROTECT_RE = re.compile(r':(hover|focus|active|focus-visible|focus-within|disabled|checked|placeholder|empty|valid|invalid|placeholder-shown|target|first-child|last-child|nth-child|nth-of-type|first-of-type|last-of-type|not\(|is\(|where\(|has\()')
PSEUDO_ELEMENT_RE = re.compile(r'::(before|after|placeholder|selection|first-line|first-letter|marker|backdrop)')
# Skydda state-classes som ofta sätts dynamiskt av JS men kanske inte triggas i coverage
STATE_CLASS_RE = re.compile(r'\.(is-|has-)|\[data-(open|active|selected|visible|expanded|state|sort)')

# Parse top-level rules + at-rules som block (@media, @supports, @layer)
rules = []
depth = 0
buf_brace_start = -1
selector_start = 0
in_comment = False
i, n = 0, len(css)
while i < n:
    if not in_comment and css[i:i+2] == '/*':
        in_comment = True; i += 2; continue
    if in_comment:
        if css[i:i+2] == '*/': in_comment = False; i += 2
        else: i += 1
        continue
    c = css[i]
    if c == '{':
        if depth == 0: buf_brace_start = i
        depth += 1
    elif c == '}':
        depth -= 1
        if depth == 0:
            sel_text = css[selector_start:buf_brace_start]
            full = css[selector_start:i+1]
            rules.append((selector_start, i+1, sel_text, full))
            selector_start = i + 1
    i += 1

print(f'Parsed {len(rules)} top-level rules')

removable = []
kept_protected = 0
kept_used = 0
kept_state = 0
for start, end, sel_raw, full in rules:
    sel = sel_raw.strip()
    if sel.startswith('@'):
        kept_protected += 1
        continue
    if PROTECT_RE.search(sel) or PSEUDO_ELEMENT_RE.search(sel):
        kept_protected += 1
        continue
    if STATE_CLASS_RE.search(sel):
        kept_state += 1
        continue
    if not sel:
        continue
    if range_overlaps_used(start, end):
        kept_used += 1
        continue
    removable.append((start, end, sel[:100], full.count('\n')))

print(f'Kept (used):        {kept_used}')
print(f'Kept (protected):   {kept_protected}  (pseudo-class/element eller @-rule)')
print(f'Kept (state-class): {kept_state}  (.is-/.has-/data-state)')
print(f'Removable:          {len(removable)}  (0% coverage)')
total_lines = sum(r[3] for r in removable)
print(f'Estimerade rader att ta bort: {total_lines}')

edits_sorted = sorted(removable, key=lambda r: r[0], reverse=True)
new_css = css
for start, end, _, _ in edits_sorted:
    new_css = new_css[:start] + new_css[end:]
new_css = re.sub(r'\n{4,}', '\n\n\n', new_css)

with open(OUT, 'w') as f:
    f.write(new_css)

print(f'Före:  {css.count(chr(10))+1} rader / {len(css)} chars')
print(f'Efter: {new_css.count(chr(10))+1} rader / {len(new_css)} chars')
print(f'Borttaget: {(css.count(chr(10))+1) - (new_css.count(chr(10))+1)} rader / {len(css)-len(new_css)} chars')
print(f'Sparat förslag i {OUT}')

print()
print('=== 30 första borttagna ===')
for start, end, sel, lines in removable[:30]:
    print(f'  ({lines:>3} rader) {sel}')
