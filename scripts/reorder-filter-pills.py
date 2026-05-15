#!/usr/bin/env python3
"""Flyttar Sprint+Senare ner till collapsed-list och Bokning+Medicinsk upp till quickstrip."""
import re
import sys

fp = "public/major-arcana-preview/index.html"
s = open(fp).read()

sprint_re = r'                    <button\s+class="queue-filter-chip queue-filter-chip--green"\s+type="button"\s+data-queue-lane="sprint"\s*>.*?</button>\n'
later_re = r'                    <button\s+class="queue-filter-chip queue-filter-chip--indigo"\s+type="button"\s+data-queue-lane="later"\s*>.*?</button>\n'
bookable_re = r'                    <button\s+class="queue-filter-chip queue-filter-chip--cyan"\s+type="button"\s+data-queue-lane="bookable"\s*>.*?</button>\n'
medical_re = r'                    <button\s+class="queue-filter-chip queue-filter-chip--magenta"\s+type="button"\s+data-queue-lane="medical"\s*>.*?</button>\n'

sm = re.search(sprint_re, s, re.DOTALL)
lm = re.search(later_re, s, re.DOTALL)
bm = re.search(bookable_re, s, re.DOTALL)
mm = re.search(medical_re, s, re.DOTALL)

if not (sm and lm and bm and mm):
    print("FAIL: en eller flera pillar saknas", file=sys.stderr)
    sys.exit(1)

if sm.start() < bm.start():
    s2 = s.replace(sm.group(0) + lm.group(0), bm.group(0) + mm.group(0), 1)
    s2 = s2.replace(bm.group(0) + mm.group(0), sm.group(0) + lm.group(0), 1)
    open(fp, "w").write(s2)
    print("OK: Sprint+Senare flyttade till collapsed-list, Bokning+Medicinsk flyttade till quickstrip")
else:
    print("SKIP: redan i ny ordning")
