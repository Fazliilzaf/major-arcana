/**
 * Shared modal design — Steg 7, 8, 9 (420px kundkort).
 * source: steg7-v6-kundkort-final-demo.html
 */
(function (global) {
  'use strict';

  const CACHE_BUST = 'hairtp-step789-kundkort-v1';

  const TOKEN_CSS = `
:root{
  --brand:#2b251f;
  --t2:rgba(70,60,50,.92);
  --t3:#8a8174;
  --accent:#bb4779;
  --card-bg:linear-gradient(180deg,rgba(255,255,255,.98) 0%,rgba(247,241,236,.86) 100%);
  --card-shadow:0 1px 2px rgba(56,40,28,.06),0 9px 22px rgba(56,40,28,.12),inset 0 1px 0 rgba(255,255,255,.96);
  --modal-bg:linear-gradient(180deg,rgba(252,249,245,.97),rgba(243,237,231,.92));
  --modal-shadow:0 2px 6px rgba(93,74,60,.06),0 30px 60px rgba(93,74,60,.16),inset 0 1px 0 rgba(255,255,255,.85);
  --header-bg:linear-gradient(180deg,rgba(255,255,255,.55),transparent);
  --success:#4a8268;
  --success-bg:rgba(74,130,104,.14);
  --warning:#c8821e;
  --warning-bg:rgba(200,130,30,.14);
  --danger:#b94a4a;
  --danger-bg:rgba(185,74,74,.14);
}`;

  function buildShellCss(rootIds, zIndex = 10040) {
    const roots = Array.isArray(rootIds) ? rootIds : [rootIds];
    const rootSel = roots.map((id) => `#${id}`).join(',');
    const scoped = roots.map((id) => `#${id}`).join(' ');
    return `${TOKEN_CSS}
${rootSel} *{box-sizing:border-box}
${rootSel}{position:fixed;inset:0;background:rgba(30,24,18,.42);display:flex;align-items:center;justify-content:center;z-index:${zIndex};backdrop-filter:blur(2px);padding:24px}
${rootSel} .demo-modal{background:var(--modal-bg);border-radius:24px;width:420px;max-width:calc(100vw - 32px);max-height:90vh;overflow-y:auto;box-shadow:var(--modal-shadow);border:1px solid rgba(255,255,255,.6);padding:0;color:var(--brand);font-family:Inter,-apple-system,system-ui,sans-serif;font-size:12.5px;line-height:1.42}
${rootSel} .wrap{margin:0}
${rootSel} .demo-header{padding:18px 18px 16px;border-bottom:1px solid rgba(215,202,194,.5);background:var(--header-bg)}
${rootSel} .demo-kicker{font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--t3);margin-bottom:8px;display:block}
${rootSel} .demo-title{font-size:16px;font-weight:800;margin:0 0 6px;color:var(--brand)}
${rootSel} .demo-subtitle{font-size:11px;color:var(--t2);margin:0;line-height:1.45}
${rootSel} .demo-scroll{padding:12px 18px 0;display:flex;flex-direction:column;gap:14px}
${rootSel} .section-block{padding:14px;border-radius:14px;background:var(--card-bg);border:1px solid rgba(255,255,255,.72);box-shadow:var(--card-shadow)}
${rootSel} .section-kicker{font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--t3);margin:0 0 8px;display:block}
${rootSel} .field{margin-bottom:12px}
${rootSel} .field:last-child{margin-bottom:0}
${rootSel} .field label{display:block;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--t3);margin-bottom:6px}
${rootSel} .field input,${rootSel} .field textarea,${rootSel} .field select{width:100%;padding:8px 11px;border-radius:10px;border:1px solid rgba(132,117,107,.28);background:#fff;font-family:inherit;font-size:12px;color:var(--brand);outline:none}
${rootSel} .field input:focus,${rootSel} .field textarea:focus,${rootSel} .field select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(187,71,121,.12)}
${rootSel} .check{display:flex;align-items:flex-start;gap:10px;padding:9px 10px;border-radius:11px;background:rgba(255,255,255,.55);cursor:pointer;border:1px solid transparent;margin-top:10px}
${rootSel} .check:hover{border-color:rgba(187,71,121,.22)}
${rootSel} .check input{flex-shrink:0;margin-top:3px}
${rootSel} .check span{font-size:12px;line-height:1.6;color:var(--brand)}
${rootSel} .actions{display:flex;gap:8px;padding:0 18px 16px;flex-wrap:wrap}
${rootSel} .btn{flex:1;min-width:100px;padding:11px;border-radius:12px;border:none;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}
${rootSel} .btn-primary{background:linear-gradient(135deg,var(--accent),#9e3a68);color:#fff;box-shadow:0 8px 18px rgba(187,71,121,.22)}
${rootSel} .btn-primary:hover:not(:disabled){transform:translateY(-1px)}
${rootSel} .btn-primary:disabled{opacity:.55;cursor:not-allowed;transform:none}
${rootSel} .btn-ghost{background:transparent;border:1px solid rgba(132,117,107,.28);color:var(--t2)}
${rootSel} .status{margin:0 18px 14px;padding:11px 14px;border-radius:11px;font-size:12px;display:none}
${rootSel} .status.show{display:block}
${rootSel} .status.success{background:var(--success-bg);color:var(--success)}
${rootSel} .status.error{background:var(--danger-bg);color:var(--danger)}
${rootSel} .status.warning{background:var(--warning-bg);color:var(--warning)}
${rootSel} .signed-panel{padding:12px 18px 18px}
${rootSel} .signed-banner{padding:18px 22px;border-radius:14px;background:linear-gradient(135deg,rgba(74,130,104,.16),rgba(74,130,104,.08));border:1px solid rgba(74,130,104,.32);text-align:center;box-shadow:var(--card-shadow)}
${rootSel} .signed-banner h3{margin:0 0 6px;font-size:16px;color:var(--success);font-weight:800}
${rootSel} .signed-banner p{margin:0;font-size:12px;color:var(--t2)}
${rootSel} .doc-text{font-size:12px;line-height:1.6;color:var(--t2);margin:0 0 10px}
${rootSel} .doc-text:last-child{margin-bottom:0}
${rootSel} .doc-text strong{color:var(--brand);font-weight:600}
${rootSel} .legal{font-size:11px;line-height:1.5;color:var(--t2);margin:0 0 12px;padding:10px 12px;border-radius:11px;background:rgba(74,123,168,.08);border:1px solid rgba(74,123,168,.18)}
${rootSel} .legal strong{color:var(--brand)}
${scoped} .mq-label{display:block;font-size:12px;font-weight:600;line-height:1.45;color:var(--brand);margin-bottom:8px}`;
  }

  global.CcoStepModalDesign = Object.freeze({
    CACHE_BUST,
    buildShellCss,
  });
})(typeof window !== 'undefined' ? window : globalThis);
