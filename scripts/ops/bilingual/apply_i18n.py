#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Direkt-applicerar SV/EN-toggle på ETT patientdokument (html.parser + re.sub longest-first)."""
import re, json, sys, os
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
bp = {p['sv']: p['en'] for p in json.load(open(os.path.join(HERE, 'offert-boilerplate.json')))}
bp2 = json.load(open(os.path.join(HERE, 'offert-boilerplate2.json')))

class Leaf(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.leaf=[]; self.stack=[]
    def handle_starttag(self,t,a): self.stack.append(t)
    def handle_endtag(self,t):
        if self.stack: self.stack.pop()
    def handle_data(self,d):
        if d.strip() and self.stack and not any(x in self.stack for x in ['script','style','svg','path','title']):
            self.leaf.append(re.sub(r'\s+',' ',d).strip())

def flex(sv):
    sv = sv.replace('&', '&amp;')
    return r'\s*'.join(re.escape(w) for w in re.sub(r'\s+', ' ', sv).strip().split())

def run(path, ov):
    s = open(path, encoding='utf-8').read()
    pr = Leaf(); pr.feed(s)
    # unika leaf-texter i dokumentet
    uniq = []
    for t in pr.leaf:
        if t and t not in uniq: uniq.append(t)
    # bygg översättning: ov eller bp/bp2
    trans = []
    for t in uniq:
        en = ov.get(t) or bp.get(t) or bp2.get(t)
        if en: trans.append((t, en))
    trans.sort(key=lambda x: -len(x[0]))
    keys = {}
    for i, (t, en) in enumerate(trans):
        k = 'k' + str(i); keys[k] = (t, en)
        pat = re.compile(r'(<([a-z][a-z0-9]*)([^>]*)>)(\s*' + flex(t) + r'\s*)(</\2\s*>)', re.S)
        s = pat.sub(lambda m, k=k: m.group(1)[:-1] + ' data-i18n="' + k + '"' + '>' + m.group(4) + m.group(5), s)
    # kvarvarande (ej översatta) leaf-texter
    left = [t for t in uniq if not (ov.get(t) or bp.get(t) or bp2.get(t))]
    # map + toggle
    mapjs = '{\n'
    for k, (t, en) in keys.items():
        tv = t.replace('\\', '\\\\').replace('"', '\\"')
        ev = en.replace('\\', '\\\\').replace('"', '\\"')
        mapjs += f'      "{k}": {{ "sv": "{tv}", "en": "{ev}" }},\n'
    mapjs += '    }'
    css = '''<style>
      .lang-toggle { position: fixed; top: 16px; right: 16px; z-index: 99; display: flex; gap: 4px; padding: 4px;
        background: rgba(252,248,244,0.92); border: 1px solid rgba(120,105,90,0.16); border-radius: 14px;
        box-shadow: 0 4px 10px rgba(45,28,18,0.12), inset 0 1px 0 rgba(255,255,255,0.5); }
      .lang-toggle button { appearance:none; border:0; cursor:pointer; padding:6px 14px; border-radius:10px;
        font-size:13px; font-weight:700; letter-spacing:.04em; background:transparent; color:rgba(70,60,50,0.55); }
      .lang-toggle button.active { background: var(--pd-primary-bg, linear-gradient(180deg,#4a4036 0%,#2b251f 100%));
        color: var(--pd-primary-text, #fff5e3); box-shadow: inset 0 1px 0 rgba(255,240,220,0.14), 0 4px 10px rgba(40,28,16,0.18); }
    </style>'''
    js = '''<script>
      (function () { var map = ''' + mapjs + ''';
        function setLang(l){ Object.keys(map).forEach(function(k){ document.querySelectorAll('[data-i18n="'+k+'"]').forEach(function(el){ if(map[k][l]!=null) el.textContent=map[k][l]; }); });
          document.querySelectorAll('.lang-toggle button').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-lang-btn')===l); });
          try{ localStorage.setItem('cco-lang',l); }catch(e){} }
        document.addEventListener('DOMContentLoaded', function(){ var bar=document.createElement('div'); bar.className='lang-toggle';
          bar.innerHTML='<button type="button" data-lang-btn="sv">SV</button><button type="button" data-lang-btn="en">EN</button>';
          document.body.appendChild(bar); bar.querySelectorAll('button').forEach(function(b){ b.addEventListener('click',function(){ setLang(b.getAttribute('data-lang-btn')); }); });
          var saved='sv'; try{ saved=localStorage.getItem('cco-lang')||'sv'; }catch(e){} setLang(saved); });
      })();
    </script>'''
    s = s.replace('</head>', css + '</head>')
    s = s.replace('</body>', js + '\n</body>')
    open(path, 'w', encoding='utf-8').write(s)
    print('KLART', os.path.basename(path), '| översatta:', len(trans), '| kvar:', len(left))
    for t in left: print('   MISS:', t[:70])

if __name__ == '__main__':
    import importlib.util
    spec = importlib.util.spec_from_file_location('cfg', sys.argv[1])
    cfg = importlib.util.module_from_spec(spec); spec.loader.exec_module(cfg)
    for job in cfg.JOBS:
        run(job['path'], job['ov'])
