#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genomför tvåspråkig (data-i18n) på ett patientdokument.
Laddar bp1+bp2 som glosar; per-dok override-översättningar.
Använder re.sub per text (säker, immutativ).
"""
import re, json, sys, os, importlib.util

PREVIEW = '/Users/fazlikrasniqi/Code/major-arcana/public/major-arcana-preview'
HERE = os.path.dirname(os.path.abspath(__file__))
bp = {p['sv']: p['en'] for p in json.load(open(os.path.join(HERE, 'offert-boilerplate.json')))}
bp2 = json.load(open(os.path.join(HERE, 'offert-boilerplate2.json')))
def en_for(t, ov):
    return ov.get(t) or bp.get(t) or bp2.get(t)

def flex(sv):
    sv = sv.replace('&', '&amp;')
    return r'\s*'.join(re.escape(w) for w in re.sub(r'\s+', ' ', sv).strip().split())

def run(path, ov):
    s = open(path, encoding='utf-8').read()
    # samla distinct leaf-text (p/div/strong/span/label/option/button/h1) med ren text
    texts = []
    for m in re.finditer(r'<(strong|span|option|p|div|label|button|h1)\b([^>]*)>(.*?)</\1\s*>', s, flags=re.S):
        if 'data-i18n' in m.group(2):
            continue
        t = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', m.group(3))).strip()
        if t and '<' not in m.group(3):
            texts.append(t)
    # bygg översättning per unik text; applicera re.sub per text
    order = []
    for t in dict.fromkeys(texts):
        en = en_for(t, ov)
        if en:
            order.append((t, en))
    keys = {}
    for i, (t, en) in enumerate(order):
        key = 'k' + str(i)
        keys[key] = (t, en)
        pat = re.compile(r'(<([a-z][a-z0-9]*)([^>]*)>)(\s*' + flex(t) + r'\s*)(</\2\s*>)', re.S)
        def rep(m, key=key):
            return m.group(1)[:-1] + ' data-i18n="' + key + '"' + '>' + m.group(4) + m.group(5)
        s = pat.sub(rep, s)
    # bygg map
    mapjs = '{\n'
    for k, (sv, en) in keys.items():
        sve = sv.replace('\\', '\\\\').replace('"', '\\"')
        e = en.replace('\\', '\\\\').replace('"', '\\"')
        mapjs += f'      "{k}": {{ "sv": "{sve}", "en": "{e}" }},\n'
    mapjs += '    }'
    toggle_css = '''<style>
      .lang-toggle { position: fixed; top: 16px; right: 16px; z-index: 99; display: flex; gap: 4px; padding: 4px;
        background: rgba(252,248,244,0.92); border: 1px solid rgba(120,105,90,0.16); border-radius: 14px;
        box-shadow: 0 4px 10px rgba(45,28,18,0.12), inset 0 1px 0 rgba(255,255,255,0.5); }
      .lang-toggle button { appearance:none; border:0; cursor:pointer; padding:6px 14px; border-radius:10px;
        font-size:13px; font-weight:700; letter-spacing:.04em; background:transparent; color:rgba(70,60,50,0.55); }
      .lang-toggle button.active { background: var(--pd-primary-bg, linear-gradient(180deg,#4a4036 0%,#2b251f 100%));
        color: var(--pd-primary-text, #fff5e3); box-shadow: inset 0 1px 0 rgba(255,240,220,0.14), 0 4px 10px rgba(40,28,16,0.18); }
    </style>'''
    toggle_js = '''<script>
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
    s = s.replace('</head>', toggle_css + '</head>')
    s = s.replace('</body>', toggle_js + '\n</body>')
    open(path, 'w', encoding='utf-8').write(s)
    print('KLART', path.split('/')[-1], '— översatta:', len(order))

if __name__ == '__main__':
    spec = importlib.util.spec_from_file_location('cfg', sys.argv[1])
    cfg = importlib.util.module_from_spec(spec); spec.loader.exec_module(cfg)
    for job in cfg.JOBS:
        run(PREVIEW + '/' + job['path'], job['ov'])
