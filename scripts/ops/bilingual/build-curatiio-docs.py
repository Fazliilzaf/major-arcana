#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bygger Curatiio-behandlingsinfo/samtycke-dokument tvåspråkiga (SV/EN) från början."""
import json, os, re
PREVIEW='/Users/fazlikrasniqi/Code/major-arcana/public/major-arcana-preview'
SHELL=open(os.path.join(PREVIEW,'patient-document-shell.css'),encoding='utf-8').read()

# varje behandling: title, subtitle, what (vad du kan förvänta), side (biverkningar), contra (kontraindikationer), consent
TREATMENTS = {
 'filler': {
   'sv': {'title':'Fillers (hyaluronsyra)','sub':'Fillers','steplabel':'Steg 4','badge':'4 av 9',
     'what':'Vad du kan förvänta: Genom injektion av hyaluronsyra fylls volym och linjer mjukas upp. Resultatet syns direkt och håller i regel 6–12 månader. Behandlingen utförs av legitimerad personal.',
     'side':'Möjliga biverkningar: Tillfällig svullnad, rodnad och blåmärken vid injektionsstället. Ovanligt med infektion eller ojämnheter, som i så fall kan korrigeras.',
     'contra':'Kontraindikationer: Graviditet, amning, pågående infektion i området, känd allergi mot hyaluronsyra eller tidigare överkänslighet.',
     'consent':'Jag har fått information om behandlingen och samtycker till den i samråd med min behandlare.'},
   'en': {'title':'Fillers (hyaluronic acid)','sub':'Fillers','steplabel':'Step 4','badge':'4 of 9',
     'what':'What to expect: hyaluronic acid is injected to restore volume and soften lines. The result is visible immediately and usually lasts 6–12 months. The treatment is performed by licensed staff.',
     'side':'Possible side effects: temporary swelling, redness and bruising at the injection site. Infection or unevenness is uncommon and can be corrected if it occurs.',
     'contra':'Contraindications: pregnancy, breastfeeding, an ongoing infection in the area, a known allergy to hyaluronic acid or previous hypersensitivity.',
     'consent':'I have received information about the treatment and consent to it in consultation with my practitioner.'},
 },
 'bleph': {
   'sv': {'title':'Ögonlocksplastik','sub':'Ögonlock','steplabel':'Steg 4','badge':'4 av 9',
     'what':'Vad du kan förvänta: Övre ögonlocksplastik tar bort överskottshud och fett för ett piggare utseende. Ingreppet görs under lokalbedövning och läkning tar cirka 1–2 veckor.',
     'side':'Möjliga biverkningar: Svullnad, blåmärken och torra ögon. Ovanligt med asymmmetri eller problem med slutning, som kan kräva uppföljning.',
     'contra':'Kontraindikationer: Aktiv ögonsjukdom, pågående infektion, blödningsrubbning eller om du inte kan följa eftervårdsråden.',
     'consent':'Jag har fått information om ingreppet och samtycker till det i samråd med min läkare.'},
   'en': {'title':'Eyelid surgery','sub':'Eyelid','steplabel':'Step 4','badge':'4 of 9',
     'what':'What to expect: upper eyelid surgery removes excess skin and fat for a more alert look. The procedure is done under local anaesthesia and healing takes about 1–2 weeks.',
     'side':'Possible side effects: swelling, bruising and dry eyes. Asymmetry or closure problems are uncommon and may need follow-up.',
     'contra':'Contraindications: active eye disease, an ongoing infection, a bleeding disorder, or if you cannot follow the aftercare advice.',
     'consent':'I have received information about the procedure and consent to it in consultation with my doctor.'},
 },
 'meso': {
   'sv': {'title':'Mesoterapi','sub':'Mesoterapi','steplabel':'Steg 4','badge':'4 av 9',
     'what':'Vad du kan förvänta: Mesoterapi injicerar näringsämnen och vitaminer i huden för att förbättra kvalitet, fukt och lyster. En serie behandlingar rekommenderas för bästa resultat.',
     'side':'Möjliga biverkningar: Tillfällig rodnad, ömhet och små blåmärken vid injektionsställena.',
     'contra':'Kontraindikationer: Graviditet, amning, pågående hudinfektion, autoimmun sjukdom eller allergi mot något av innehållsämnena.',
     'consent':'Jag har fått information om behandlingen och samtycker till den i samråd med min behandlare.'},
   'en': {'title':'Mesotherapy','sub':'Mesotherapy','steplabel':'Step 4','badge':'4 of 9',
     'what':'What to expect: mesotherapy injects nutrients and vitamins into the skin to improve quality, hydration and glow. A series of treatments is recommended for best results.',
     'side':'Possible side effects: temporary redness, tenderness and small bruises at the injection sites.',
     'contra':'Contraindications: pregnancy, breastfeeding, an ongoing skin infection, autoimmune disease or allergy to any of the ingredients.',
     'consent':'I have received information about the treatment and consent to it in consultation with my practitioner.'},
 },
 'fett': {
   'sv': {'title':'Fettlösande behandling','sub':'Fettuplösning','steplabel':'Steg 4','badge':'4 av 9',
     'what':'Vad du kan förvänta: Fettlösande injektion bryter ner lokala fettansamlingar som är svåra att påverka med träning. Flera behandlingar kan krävas och resultatet förbättras över tid.',
     'side':'Möjliga biverkningar: Svullnad, rodnad, ömhet och tillfälliga blåmärken. Ovanligt med ojämnheter eller infektion.',
     'contra':'Kontraindikationer: Graviditet, amning, pågående infektion, blödningsrubbning eller dålig mikrocirkulation i området.',
     'consent':'Jag har fått information om behandlingen och samtycker till den i samråd med min läkare.'},
   'en': {'title':'Fat dissolving treatment','sub':'Fat dissolving','steplabel':'Step 4','badge':'4 of 9',
     'what':'What to expect: fat dissolving injections break down local fat deposits that are hard to affect through exercise. Several treatments may be needed and the result improves over time.',
     'side':'Possible side effects: swelling, redness, tenderness and temporary bruising. Unevenness or infection is uncommon.',
     'contra':'Contraindications: pregnancy, breastfeeding, an ongoing infection, a bleeding disorder or poor circulation in the area.',
     'consent':'I have received information about the treatment and consent to it in consultation with my doctor.'},
 },
 'ortoped': {
   'sv': {'title':'Ortopediska injektioner','sub':'Ortopedi','steplabel':'Steg 4','badge':'4 av 9',
     'what':'Vad du kan förvänta: Ortopediska injektioner (t.ex. kortison eller hyaluronsyra) lindrar led- och mjukdelssmärta. Behandlingen utförs av legitimerad personal och effekten varierar.',
     'side':'Möjliga biverkningar: Tillfällig smärtökning första dagarna, rodnad eller blåmärken. Ovanligt med infektion.',
     'contra':'Kontraindikationer: Pågående infektion i leden, blödningsrubbning, allergi mot injektionsmedlet eller nyligen genomgången större operation.',
     'consent':'Jag har fått information om behandlingen och samtycker till den i samråd med min läkare.'},
   'en': {'title':'Orthopaedic injections','sub':'Orthopaedics','steplabel':'Step 4','badge':'4 of 9',
     'what':'What to expect: orthopaedic injections (e.g. cortisone or hyaluronic acid) relieve joint and soft-tissue pain. The treatment is performed by licensed staff and the effect varies.',
     'side':'Possible side effects: a temporary increase in pain for the first days, redness or bruising. Infection is uncommon.',
     'contra':'Contraindications: an ongoing joint infection, a bleeding disorder, allergy to the injected medication, or recent major surgery.',
     'consent':'I have received information about the treatment and consent to it in consultation with my doctor.'},
 },
}

def build(name, t):
    def escape(x): return x.replace('&','&amp;')
    # blocks (sv + en) -> data-i18n map element
    keys = ['what','side','contra','consent']
    # vi bygger hela map manuellt
    mapjs={}
    for k in keys:
        mapjs[k+'_t']={'sv':escape(t['sv'][k].split(':')[0].strip()),'en':escape(t['en'][k].split(':')[0].strip())}
        mapjs[k]= {'sv':escape(t['sv'][k].split(':',1)[1].strip()) if ':' in t['sv'][k] else escape(t['sv'][k]), 'en':escape(t['en'][k].split(':',1)[1].strip()) if ':' in t['en'][k] else escape(t['en'][k])}
    # header
    hdr='<div class="page-header">'+'<img class="header-logo" src="assets/curatiio-logo.png" alt="Curatiio" />'+'<div class="header-content"><div class="header-top"><h1 class="header-title" data-i18n="title">'+escape(t['sv']['title'])+'</h1><span class="header-badge" data-i18n="badge">'+t['sv']['badge']+'</span></div><div style="display:flex;justify-content:space-between;align-items:center;"><p class="header-subtitle" data-i18n="sub">'+escape(t['sv']['sub'])+'</p><div style="font-size:10px;font-weight:700;color:var(--t3)" data-i18n="steplabel">'+t['sv']['steplabel']+'</div></div><div class="progress-bar"><div class="progress-fill" style="width:44.44%"></div></div></div></div>'
    blocks=[]
    for k in keys:
        txt=t['sv'][k]
        if ':' in txt: head,body=txt.split(':',1)
        else: head,body=txt,''
        block='<div class="section-block"><div class="section-title" data-i18n="'+k+'_t">'+escape(head.strip())+'</div><p class="doc-text" data-i18n="'+k+'">'+escape(body.strip())+'</p></div>'
        blocks.append(block)
    actions='<div class="section-block"><div class="actions"><button type="button" class="btn btn-ghost" data-i18n="savedraft">Spara utkast</button><button type="button" class="btn btn-primary" data-i18n="sign">Signera &amp; skicka</button></div></div>'
    mapjs['savedraft']={'sv':'Spara utkast','en':'Save draft'}
    mapjs['sign']={'sv':'Signera & skicka','en':'Sign & send'}
    mapjs['title']={'sv':escape(t['sv']['title']),'en':escape(t['en']['title'])}
    mapjs['sub']={'sv':escape(t['sv']['sub']),'en':escape(t['en']['sub'])}
    mapjs['badge']={'sv':t['sv']['badge'],'en':t['en']['badge']}
    mapjs['steplabel']={'sv':t['sv']['steplabel'],'en':t['en']['steplabel']}
    map_js='var map = '+json.dumps(mapjs,ensure_ascii=False)+';'
    bodyInner='<div class="page-wrapper">'+hdr+'\n<div class="page-content">'+''.join(blocks)+actions+'</div>\n</div>'
    js='''<script>
      (function () { '''+map_js+'''
        function setLang(l){ Object.keys(map).forEach(function(k){ document.querySelectorAll('[data-i18n="'+k+'"]').forEach(function(el){ if(map[k][l]!=null) el.textContent=map[k][l]; }); });
          document.querySelectorAll('.lang-toggle button').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-lang-btn')===l); });
          try{ localStorage.setItem('cco-lang',l); }catch(e){} }
        document.addEventListener('DOMContentLoaded', function(){ var bar=document.createElement('div'); bar.className='lang-toggle';
          bar.innerHTML='<button type="button" data-lang-btn="sv">SV</button><button type="button" data-lang-btn="en">EN</button>';
          document.body.appendChild(bar); bar.querySelectorAll('button').forEach(function(b){ b.addEventListener('click',function(){ setLang(b.getAttribute('data-lang-btn')); }); });
          var saved='sv'; try{ saved=localStorage.getItem('cco-lang')||'sv'; }catch(e){} setLang(saved); });
      })();
    </script>'''
    css='<style>'+SHELL+'''</style><style>
      .lang-toggle { position: fixed; top: 16px; right: 16px; z-index: 99; display: flex; gap: 4px; padding: 4px;
        background: rgba(252,248,244,0.92); border: 1px solid rgba(120,105,90,0.16); border-radius: 14px;
        box-shadow: 0 4px 10px rgba(45,28,18,0.12), inset 0 1px 0 rgba(255,255,255,0.5); }
      .lang-toggle button { appearance:none; border:0; cursor:pointer; padding:6px 14px; border-radius:10px;
        font-size:13px; font-weight:700; letter-spacing:.04em; background:transparent; color:rgba(70,60,50,0.55); }
      .lang-toggle button.active { background: var(--pd-primary-bg, linear-gradient(180deg,#4a4036 0%,#2b251f 100%));
        color: var(--pd-primary-text, #fff5e3); box-shadow: inset 0 1px 0 rgba(255,240,220,0.14), 0 4px 10px rgba(40,28,16,0.18); }
    </style>'''
    html=f'<!DOCTYPE html>\n<html lang="sv">\n<head>\n<meta charset="utf-8"/>\n<meta name="viewport" content="width=device-width,initial-scale=1"/>\n<title>{t["sv"]["title"]} | Curatiio</title>\n{css}\n</head>\n<body>\n{bodyInner}\n{js}\n</body>\n</html>'
    out=os.path.join(PREVIEW,'curatiio-'+name+'-info-final-demo.html')
    open(out,'w',encoding='utf-8').write(html)
    print('✓ byggd:',os.path.basename(out))

for name,t in TREATMENTS.items():
    build(name,t)
