/**
 * Shared modal design — Steg 7, 8, 9 (420px kundkort).
 * source: kunder-mockup-v10.html panel tokens + Major Arcana elevation
 */
(function (global) {
  'use strict';

  const CACHE_BUST = 'hairtp-step789-kundkort-v5';

  const TOKEN_CSS = `
:root{
  --brand:#2b251f;
  --t2:rgba(70,60,50,.92);
  --t3:#8a8174;
  --accent:#bb4779;
  --rose-pill-top:rgba(252,233,240,.98);
  --rose-pill-bottom:rgba(241,207,220,.95);
  --panel-shell-top:rgba(250,246,242,.96);
  --panel-shell-bottom:rgba(241,234,227,.9);
  --panel-card-top:rgba(255,255,255,.96);
  --panel-card-bottom:rgba(247,241,236,.88);
  --card-bg:linear-gradient(180deg,var(--panel-card-top) 0%,var(--panel-card-bottom) 100%);
  --card-shadow:0 3px 10px rgba(56,40,28,.08),0 1px 2px rgba(56,40,28,.05),inset 0 1px 0 rgba(255,255,255,.92);
  --card-shadow-hover:0 8px 22px rgba(56,40,28,.11),inset 0 1px 0 rgba(255,255,255,.96);
  --modal-bg:linear-gradient(180deg,var(--panel-shell-top),var(--panel-shell-bottom));
  --modal-shadow:0 32px 70px rgba(93,74,60,.14),0 14px 32px rgba(156,145,166,.07),0 0 0 1px rgba(255,255,255,.22),inset 0 1px 0 rgba(255,255,255,.58);
  --header-bg:linear-gradient(180deg,rgba(255,255,255,.72),rgba(255,255,255,.08));
  --success:#4a8268;
  --success-bg:rgba(74,130,104,.14);
  --warning:#c8821e;
  --warning-bg:rgba(200,130,30,.14);
  --danger:#b94a4a;
  --danger-bg:rgba(185,74,74,.14);
}
@keyframes ccoStepModalIn{
  from{opacity:0;transform:translateY(16px) scale(.985)}
  to{opacity:1;transform:none}
}
@media (prefers-reduced-motion:reduce){
  @keyframes ccoStepModalIn{from,to{opacity:1;transform:none}}
}`;

  function buildShellCss(rootIds, zIndex = 10040) {
    const roots = Array.isArray(rootIds) ? rootIds : [rootIds];
    const rootSel = roots.map((id) => `#${id}`).join(',');
    const scoped = roots.map((id) => `#${id}`).join(' ');
    return `${TOKEN_CSS}
${rootSel} *{box-sizing:border-box}
${rootSel}{position:fixed;inset:0;background:rgba(20,16,12,.58);display:flex;align-items:center;justify-content:center;z-index:${zIndex};-webkit-backdrop-filter:blur(10px) saturate(1.08);backdrop-filter:blur(10px) saturate(1.08);padding:24px}
${rootSel} .demo-modal{
  background:
    radial-gradient(ellipse at 50% 0%,rgba(255,210,225,.22),transparent 52%),
    radial-gradient(ellipse at 100% 100%,rgba(255,225,200,.14),transparent 45%),
    var(--modal-bg);
  border-radius:24px;width:420px;max-width:calc(100vw - 32px);max-height:90vh;overflow-y:auto;
  box-shadow:var(--modal-shadow);
  border:1px solid rgba(255,255,255,.72);
  padding:0;color:var(--brand);
  font-family:Inter,-apple-system,system-ui,sans-serif;font-size:12.5px;line-height:1.42;
  animation:ccoStepModalIn .34s cubic-bezier(.32,1.12,.64,1)
}
${rootSel} .wrap{margin:0}
${rootSel} .demo-header{
  padding:20px 20px 18px;
  border-bottom:1px solid rgba(215,202,194,.45);
  background:var(--header-bg);
  position:relative
}
${rootSel} .demo-header::after{
  content:"";position:absolute;left:20px;right:20px;bottom:0;height:1px;
  background:linear-gradient(90deg,transparent,rgba(187,71,121,.28),transparent)
}
${rootSel} .demo-kicker{
  display:inline-flex;align-items:center;gap:6px;
  padding:5px 11px;border-radius:999px;
  background:linear-gradient(180deg,var(--rose-pill-top),var(--rose-pill-bottom));
  color:var(--accent);font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
  margin-bottom:12px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.95),0 4px 14px rgba(187,71,121,.16)
}
${rootSel} .demo-title{font-size:18px;font-weight:800;margin:0 0 8px;color:var(--brand);letter-spacing:-.02em;line-height:1.2}
${rootSel} .demo-subtitle{font-size:11.5px;color:var(--t2);margin:0;line-height:1.5;max-width:34ch}
${rootSel} .demo-scroll{padding:16px 20px 0;display:flex;flex-direction:column;gap:16px}
${rootSel} .section-block{
  padding:16px;border-radius:16px;background:var(--card-bg);
  border:1px solid rgba(255,255,255,.78);
  box-shadow:var(--card-shadow);
  transition:box-shadow .18s ease,transform .18s ease
}
${rootSel} .section-block:hover{box-shadow:var(--card-shadow-hover)}
${rootSel} .section-block--sign{
  border-top:2px solid rgba(187,71,121,.2);
  background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(252,245,248,.88))
}
${rootSel} .section-kicker{
  font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);
  margin:0 0 10px;display:flex;align-items:center;gap:8px
}
${rootSel} .section-kicker::before{
  content:"";width:6px;height:6px;border-radius:999px;
  background:linear-gradient(135deg,var(--accent),#9e3a68);
  box-shadow:0 0 0 3px rgba(187,71,121,.14)
}
${rootSel} .field{margin-bottom:14px}
${rootSel} .field:last-child{margin-bottom:0}
${rootSel} .field label{
  display:block;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
  color:var(--t3);margin-bottom:7px
}
${rootSel} .field input,${rootSel} .field textarea,${rootSel} .field select{
  width:100%;padding:10px 12px;border-radius:12px;
  border:1px solid rgba(132,117,107,.26);
  background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(250,246,242,.92));
  font-family:inherit;font-size:12px;color:var(--brand);outline:none;
  box-shadow:inset 0 1px 2px rgba(56,40,28,.06),inset 0 1px 0 rgba(255,255,255,.92);
  transition:border-color .15s ease,box-shadow .15s ease
}
${rootSel} .field input:focus,${rootSel} .field textarea:focus,${rootSel} .field select:focus{
  border-color:rgba(187,71,121,.45);
  box-shadow:inset 0 1px 2px rgba(56,40,28,.05),0 0 0 3px rgba(187,71,121,.14)
}
${rootSel} .check{
  display:flex;align-items:flex-start;gap:10px;padding:11px 12px;border-radius:12px;
  background:linear-gradient(180deg,rgba(255,255,255,.72),rgba(247,241,236,.58));
  cursor:pointer;border:1px solid rgba(215,202,194,.35);margin-top:12px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.9);
  transition:border-color .15s ease,background .15s ease,box-shadow .15s ease
}
${rootSel} .check:hover{border-color:rgba(187,71,121,.28);box-shadow:inset 0 1px 0 rgba(255,255,255,.95),0 4px 12px rgba(187,71,121,.08)}
${rootSel} .check:has(input:checked){
  background:linear-gradient(180deg,rgba(252,233,240,.72),rgba(241,207,220,.38));
  border-color:rgba(187,71,121,.32);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.95),0 4px 14px rgba(187,71,121,.12)
}
${rootSel} .check input{flex-shrink:0;margin-top:3px;accent-color:var(--accent)}
${rootSel} .check span{font-size:12px;line-height:1.6;color:var(--brand)}
${rootSel} .actions{
  display:flex;gap:10px;padding:16px 20px 20px;flex-wrap:wrap;
  border-top:1px solid rgba(215,202,194,.35);
  background:linear-gradient(180deg,rgba(255,255,255,.42),rgba(255,255,255,0))
}
${rootSel} .btn{
  flex:1;min-width:100px;padding:12px 14px;border-radius:14px;border:none;
  font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;
  transition:transform .14s ease,box-shadow .14s ease,opacity .14s ease
}
${rootSel} .btn-primary{
  background:linear-gradient(180deg,rgba(196,78,130,.94),rgba(158,58,104,.98));
  color:#fff;
  box-shadow:0 4px 10px rgba(45,28,18,.18),inset 0 1px 0 rgba(255,255,255,.32),inset 0 -2px 0 rgba(0,0,0,.12),0 10px 22px rgba(187,71,121,.24)
}
${rootSel} .btn-primary:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 6px 14px rgba(45,28,18,.2),inset 0 1px 0 rgba(255,255,255,.34),inset 0 -2px 0 rgba(0,0,0,.12),0 14px 28px rgba(187,71,121,.28)}
${rootSel} .btn-primary:active:not(:disabled){transform:translateY(0)}
${rootSel} .btn-primary:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:0 2px 6px rgba(45,28,18,.1),inset 0 1px 0 rgba(255,255,255,.2)}
${rootSel} .btn-ghost{
  background:linear-gradient(180deg,rgba(255,255,255,.86),rgba(247,241,236,.74));
  border:1px solid rgba(132,117,107,.28);color:var(--t2);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.94),0 2px 6px rgba(56,40,28,.06)
}
${rootSel} .btn-ghost:hover{background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(247,241,236,.82));transform:translateY(-1px)}
${rootSel} .status{margin:0 20px 16px;padding:12px 14px;border-radius:12px;font-size:12px;display:none;font-weight:600}
${rootSel} .status.show{display:block}
${rootSel} .status.success{background:var(--success-bg);color:var(--success);border:1px solid rgba(74,130,104,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.5)}
${rootSel} .status.error{background:var(--danger-bg);color:var(--danger);border:1px solid rgba(185,74,74,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.5)}
${rootSel} .status.warning{background:var(--warning-bg);color:var(--warning);border:1px solid rgba(200,130,30,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.5)}
${rootSel} .signed-panel{padding:12px 20px 20px}
${rootSel} .signed-banner{
  padding:20px 22px;border-radius:16px;
  background:linear-gradient(135deg,rgba(74,130,104,.2),rgba(74,130,104,.08));
  border:1px solid rgba(74,130,104,.32);text-align:center;box-shadow:var(--card-shadow)
}
${rootSel} .signed-banner h3{margin:0 0 8px;font-size:17px;color:var(--success);font-weight:800;letter-spacing:-.01em}
${rootSel} .signed-banner p{margin:0;font-size:12px;color:var(--t2);line-height:1.5}
${rootSel} .doc-scroll{
  padding:12px 14px;border-radius:12px;
  background:rgba(255,255,255,.42);border:1px solid rgba(215,202,194,.32);
  box-shadow:inset 0 1px 2px rgba(56,40,28,.05),inset 0 1px 0 rgba(255,255,255,.88)
}
${rootSel} .doc-text{font-size:12px;line-height:1.62;color:var(--t2);margin:0 0 10px}
${rootSel} .doc-text:last-child{margin-bottom:0}
${rootSel} .doc-text strong{color:var(--brand);font-weight:650}
${rootSel} .legal{
  font-size:11px;line-height:1.55;color:var(--t2);margin:0 0 14px;padding:12px 14px 12px 16px;border-radius:12px;
  background:linear-gradient(180deg,rgba(74,123,168,.1),rgba(74,123,168,.05));
  border:1px solid rgba(74,123,168,.2);
  border-left:3px solid rgba(74,123,168,.45);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.55)
}
${rootSel} .legal strong{color:var(--brand)}
${scoped} .mq-label{display:block;font-size:12px;font-weight:650;line-height:1.48;color:var(--brand);margin-bottom:8px}`;
  }

  global.CcoStepModalDesign = Object.freeze({
    CACHE_BUST,
    buildShellCss,
  });
})(typeof window !== 'undefined' ? window : globalThis);
