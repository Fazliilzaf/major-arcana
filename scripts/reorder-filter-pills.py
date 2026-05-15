#!/usr/bin/env python3
"""Flyttar Sprint+Senare ner till collapsed-list och Bokning+Medicinsk upp till quickstrip.

Använder placeholders + slice från originalsträngen (inte regex.group()) så
extra whitespace mellan blocken inkluderas korrekt.
"""
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

if sm.start() >= bm.start():
    print("SKIP: redan i ny ordning")
    sys.exit(0)

# Slice DIREKT från strängen (inkluderar all whitespace mellan blocken)
sprint_slice = s[sm.start():lm.end()]    # Sprint+Later i quickstrip
bookable_slice = s[bm.start():mm.end()]  # Bookable+Medical i collapsed

# Använd unika placeholders så replace() inte träffar fel block
PH_QUICKSTRIP = "<!--__PH_QUICKSTRIP__-->"
PH_COLLAPSED = "<!--__PH_COLLAPSED__-->"

s1 = s.replace(sprint_slice, PH_QUICKSTRIP, 1)
if s1 == s:
    print("FAIL: kunde inte ersätta sprint_slice", file=sys.stderr); sys.exit(1)

s2 = s1.replace(bookable_slice, PH_COLLAPSED, 1)
if s2 == s1:
    print("FAIL: kunde inte ersätta bookable_slice", file=sys.stderr); sys.exit(1)

s3 = s2.replace(PH_QUICKSTRIP, bookable_slice, 1)
s4 = s3.replace(PH_COLLAPSED, sprint_slice, 1)

if "__PH_" in s4:
    print("FAIL: placeholders kvar i resultat", file=sys.stderr); sys.exit(1)

# Verifiera ny ordning
new_sm = re.search(sprint_re, s4, re.DOTALL)
new_bm = re.search(bookable_re, s4, re.DOTALL)
if not (new_sm and new_bm):
    print("FAIL: pillar försvann", file=sys.stderr); sys.exit(1)
if new_bm.start() >= new_sm.start():
    print(f"FAIL: ordning fortfarande fel — bookable byte {new_bm.start()}, sprint byte {new_sm.start()}", file=sys.stderr); sys.exit(1)

open(fp, "w").write(s4)
print(f"OK: Sprint+Senare flyttade till collapsed-list, Bokning+Medicinsk flyttade till quickstrip ({len(s4)} bytes, sprint nu på byte {new_sm.start()}, bookable nu på byte {new_bm.start()})")
