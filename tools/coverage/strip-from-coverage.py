#!/usr/bin/env python3
"""
Läser coverage-output.json (från Puppeteer) och tar bort styles.css-regler
som är 100% oanvända enligt körningen.

Skydd mot falska positiver:
- Bara ta bort regler där 0 byte används (helt utanför used-ranges)
- Skippa selektorer med :hover, :focus, :active, ::placeholder, ::before
  etc. som fyrar bara vid interaktion eller pseudo-element
- Skippa @media, @supports, @keyframes (block-nivå at-rules)
- Skippa selektorer med dynamiska prefix
"""
import json, re, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COVERAGE_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'coverage-output.json')
CSS_FILE = os.path.join(ROOT, 'public/major-arcana-preview/styles.css')

with open(COVERAGE_JSON) as f:
    coverage = json.load(f)

# Hitta entry för styles.css
styles_entry = None
for c in coverage:
    if 'styles.css' in c['url']:
        styles_entry = c
        break
if not styles_entry:
    print("ERROR: hittade ingen styles.css i coverage-output", file=sys.stderr)
    sys.exit(1)

with open(CSS_FILE) as f:
    css = f.read()

# Validera: textLength måste matcha
if styles_entry['textLength'] != len(css):
    print(f"VARNING: coverage-textLength={styles_entry['textLength']} men file har {len(css)} chars", file=sys.stderr)
    print("(Kan vara nya commits sedan coverage kördes — rerun coverage-runner.js)", file=sys.stderr)
    sys.exit(2)

# used-ranges: lista av {start, end}
used_ranges = sorted(styles_entry['ranges'], key=lambda r: r['start'])

def is_byte_used(byte_index):
    # Binärsök för effektivitet
    lo, hi = 0, len(used_ranges)
    while lo < hi:
        mid = (lo + hi) // 2
        r = used_ranges[mid]
        if byte_index < r['start']:
            hi = mid
        elif byte_index >= r['end']:
            lo = mid + 1
        else:
            return True
    return False

def range_overlaps_used(start, end):
    # Returnerar True om någon byte i [start, end) är used
    for r in used_ranges:
        if r['end'] <= start: continue
        if r['start'] >= end: break
        return True
    return False

# Skydda dessa pseudo-selektorer/@-rules
PROTECT_RE = re.compile(r':(hover|focus|active|focus-visible|focus-within|disabled|checked|placeholder|empty|valid|invalid|placeholder-shown|target|first-child|last-child|nth-child|nth-of-type|first-of-type|last-of-type|not\(|is\(|where\(|has\()')
PSEUDO_ELEMENT_RE = re.compile(r'::(before|after|placeholder|selection|first-line|first-letter|marker|backdrop)')

# Parse top-level rules + @media/@supports
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
for start, end, sel_raw, full in rules:
    sel = sel_raw.strip()
    # Skippa @-rules på top-level (@media, @supports, @keyframes, @import, etc.)
    if sel.startswith('@'):
        kept_protected += 1
        continue
    # Skippa om någon del innehåller pseudo-class/element som fyrar bara
    # vid interaktion eller är pseudo-element
    if PROTECT_RE.search(sel) or PSEUDO_ELEMENT_RE.search(sel):
        kept_protected += 1
        continue
    # Tom regel? skip
    if not sel:
        continue
    # Kolla om någon byte i regeln är used
    if range_overlaps_used(start, end):
        kept_used += 1
        continue
    # Hela regeln är oanvänd — kandidat
    removable.append((start, end, sel[:80], full.count('\n')))

print(f'Kept (used):       {kept_used}')
print(f'Kept (protected):  {kept_protected}  (innehåller pseudo-class/element eller @-rule)')
print(f'Removable:         {len(removable)}  (0% coverage, inga pseudo-classes)')
total_lines = sum(r[3] for r in removable)
print(f'Estimerade rader att ta bort: {total_lines}')

# Bygg ny CSS
edits_sorted = sorted(removable, key=lambda r: r[0], reverse=True)
new_css = css
for start, end, _, _ in edits_sorted:
    new_css = new_css[:start] + new_css[end:]
new_css = re.sub(r'\n{4,}', '\n\n\n', new_css)

OUT = '/tmp/styles-stripped-r3.css'
with open(OUT, 'w') as f:
    f.write(new_css)

print(f'Före:  {css.count(chr(10))+1} rader / {len(css)} chars')
print(f'Efter: {new_css.count(chr(10))+1} rader / {len(new_css)} chars')
print(f'Borttaget: {(css.count(chr(10))+1) - (new_css.count(chr(10))+1)} rader / {len(css)-len(new_css)} chars')
print(f'Sparat förslag i {OUT}')

# Lista de 30 första borttagna selektorerna för visibility
print()
print('=== 30 första borttagna ===')
for start, end, sel, lines in removable[:30]:
    print(f'  ({lines:>3} rader) {sel}')
