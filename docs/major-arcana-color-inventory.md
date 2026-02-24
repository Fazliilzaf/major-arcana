# Major Arcana – Färginventering

- Genererad: 2026-02-24T01:47:12.164Z
- Källa: `/Users/fazlikrasniqi/Desktop/Arcana/public/admin.html`
- Scope: CSS i `public/admin.html` `<style>`-block

## 1) Design tokens i :root

| Token | Värde | `var()` träffar | Exempel på selektorer |
|---|---|---:|---|
| `--bg` | `#2A2A2A` | 1 | body |
| `--panel` | `rgba(40, 44, 50, 0.86)` | 0 | — |
| `--panel-soft` | `rgba(23, 26, 31, 0.78)` | 0 | — |
| `--panel-soft-2` | `rgba(30, 34, 40, 0.74)` | 0 | — |
| `--text` | `#f7f3ef` | 9 | body, h2, .btn, .modal-title, .modal-input |
| `--muted` | `rgba(233, 223, 213, 0.9)` | 19 | .muted, label, .status-line, .modal-subtitle, .modal-label |
| `--line` | `rgba(223, 205, 188, 0.24)` | 16 | .badge, .risk-detail-card, .audit-timeline, .audit-detail, .audit-diff-row |
| `--accent` | `#deb590` | 1 | input[type="checkbox"] |
| `--accent-2` | `#ecccb0` | 0 | — |
| `--accent-text` | `#1A1411` | 3 | .btn.btn-primary, .section-nav .btn.active, .preview-cta |
| `--ok` | `#50c878` | 2 | .dot.ok, .notification-item.ok |
| `--warn` | `#f2b84b` | 2 | .dot.warn, .notification-item.warn |
| `--bad` | `#e46b6b` | 2 | .dot.bad, .notification-item.bad |
| `--glass-bg` | `rgba(48, 48, 48, 0.28)` | 4 | .glass, .btn, .chip, .glass-toolbar |
| `--glass-bg-strong` | `rgba(48, 48, 48, 0.42)` | 3 | .glass:hover, .btn:hover, .chip:hover |
| `--glass-border` | `rgba(235, 220, 207, 0.14)` | 4 | :root, .glass, .btn, .glass-toolbar |
| `--glass-highlight` | `rgba(253, 246, 244, 0.10)` | 3 | .glass, .btn, .glass-toolbar |
| `--glass-edge` | `var(--glass-border)` | 8 | .modal-dialog, .modal-input, .toast, .toast-close, .chip |
| `--glass-layer-a` | `rgba(52, 56, 64, 0.84)` | 1 | .team-profile-item |
| `--glass-layer-b` | `rgba(33, 36, 42, 0.7)` | 1 | .team-profile-item |
| `--glass-row-a` | `rgba(59, 63, 72, 0.84)` | 5 | tbody td, .table-wrap tbody td, .list li, .risk-timeline li, .audit-timeline-item |
| `--glass-row-b` | `rgba(36, 39, 45, 0.68)` | 5 | tbody td, .table-wrap tbody td, .list li, .risk-timeline li, .audit-timeline-item |
| `--glass-row-hover-a` | `rgba(77, 82, 92, 0.9)` | 5 | tbody tr:hover td, .table-wrap tbody tr:hover td, .list li:hover, .risk-timeline li:hover, .audit-timeline-item:hover |
| `--glass-row-hover-b` | `rgba(43, 46, 53, 0.76)` | 5 | tbody tr:hover td, .table-wrap tbody tr:hover td, .list li:hover, .risk-timeline li:hover, .audit-timeline-item:hover |
| `--glass-shadow` | `0 26px 50px rgba(0, 0, 0, 0.52), 0 10px 16px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.2)` | 1 | :root |
| `--shadow-soft` | `0 10px 26px rgba(0, 0, 0, 0.35)` | 10 | .glass, .glass:active, .btn, .btn:active, .btn.btn-ghost |
| `--shadow-elev` | `0 18px 42px rgba(0, 0, 0, 0.48)` | 6 | .glass:hover, .glass:focus-visible, .btn:hover, .btn.btn-primary:hover, .btn.btn-ghost:hover |
| `--shadow-inset` | `inset 0 1px 0 rgba(253, 246, 244, 0.06)` | 13 | .glass, .glass:hover, .glass:active, .glass:focus-visible, .btn |
| `--glow-accent` | `0 0 0 1px rgba(194, 170, 156, 0.22), 0 0 22px rgba(235, 220, 207, 0.18)` | 4 | .glass:focus-visible, .btn.active, textarea:focus-visible, .chip.is-active |
| `--t-fast` | `120ms` | 7 | :root, .glass, .btn, .table-wrap tbody td, .table-wrap tbody tr.row-link |
| `--t-med` | `180ms` | 14 | :root, .glass, .btn, .table-wrap tbody td, .drawer |
| `--ease` | `cubic-bezier(.2,.8,.2,1)` | 21 | :root, .glass, .btn, .table-wrap tbody td, .table-wrap tbody tr.row-link |
| `--motion-fast` | `var(--t-fast) var(--ease)` | 16 | .panel, .toast, .list li, .risk-timeline li, .audit-timeline-item |
| `--motion-smooth` | `var(--t-med) var(--ease)` | 10 | .panel, .toast, .list li, .risk-timeline li, .audit-timeline-item |
| `--r-sm` | `10px` | 1 | .btn.small |
| `--r-md` | `14px` | 3 | .glass, .btn, .glass-toolbar |
| `--r-lg` | `18px` | 3 | .panel, .table-wrap, .card |
| `--table-bg` | `rgba(35, 35, 35, 0.70)` | 1 | .table-wrap |
| `--table-row-a` | `rgba(52, 56, 64, 0.28)` | 0 | — |
| `--table-row-b` | `rgba(33, 36, 42, 0.20)` | 0 | — |
| `--table-row-hover` | `rgba(77, 82, 92, 0.36)` | 0 | — |
| `--table-border` | `rgba(235, 220, 207, 0.10)` | 0 | — |
| `--table-divider` | `rgba(235, 220, 207, 0.08)` | 0 | — |
| `--table-header-bg` | `rgba(31, 31, 31, 0.86)` | 0 | — |
| `--table-header-text` | `rgba(253, 246, 244, 0.95)` | 1 | .table-wrap thead th |
| `--table-cell-text` | `rgba(253, 246, 244, 0.92)` | 2 | .table-wrap table, .table-wrap .table-empty strong |
| `--table-cell-muted` | `rgba(232, 221, 213, 0.82)` | 1 | .table-wrap .table-empty |
| `--badge-bg` | `rgba(48, 48, 48, 0.40)` | 0 | — |
| `--badge-border` | `rgba(235, 220, 207, 0.14)` | 0 | — |
| `--active-glow` | `rgba(236, 204, 176, 0.42)` | 1 | [data-section-group].group-active |
| `--section-tint-default` | `rgba(94, 110, 136, 0.09)` | 5 | .panel::before, .form-block-grid, .glass-action-row, [data-section-group], .team-profile-item |
| `--shadow-3d` | `var(--glass-shadow)` | 0 | — |
| `--depth-panel-shadow` | `0 26px 52px rgba(0, 0, 0, 0.5), 0 10px 20px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.14)` | 2 | .panel, .table-wrap |
| `--depth-panel-shadow-hover` | `0 32px 62px rgba(0, 0, 0, 0.56), 0 12px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.16)` | 1 | .panel:hover |
| `--depth-row-shadow` | `0 16px 30px rgba(0, 0, 0, 0.34), 0 6px 12px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.14)` | 1 | .table-wrap tbody td |
| `--depth-row-shadow-hover` | `0 24px 38px rgba(0, 0, 0, 0.42), 0 8px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.18)` | 1 | .table-wrap tbody tr:hover td |
| `--ma-shadow-far` | `0 56px 110px rgba(0, 0, 0, 0.4)` | 1 | .admin-brand-mark-shell |
| `--ma-shadow-mid` | `0 30px 62px rgba(0, 0, 0, 0.34)` | 1 | .admin-brand-mark-shell |
| `--ma-shadow-close` | `0 14px 28px rgba(0, 0, 0, 0.28)` | 1 | .admin-brand-mark-shell |
| `--ma-halo` | `0 0 120px rgba(235, 220, 207, 0.08)` | 1 | .admin-brand-mark-shell |
| `--ma-edge` | `0 0 0 1px rgba(235, 220, 207, 0)` | 1 | .admin-brand-mark-shell |
| `--ma-bottom-vignette` | `rgba(0, 0, 0, 0.44)` | 0 | — |

## 2) Alla färgkoder som används (literals)

| Färgkod | Antal träffar | Exempel på selektorer | Linjer (första 6) |
|---|---:|---|---|
| `rgba(255, 255, 255, 0.2)` | 12 | :root, thead th:first-child, thead th:last-child, tbody tr td:first-child, tbody tr td:last-child | 29, 445, 450, 465, 470, 476 |
| `rgba(255,255,255,0.14)` | 10 | .badge, .risk-timeline li, .audit-timeline-item, .audit-diff-value, .risk-trend-track | 158, 1019, 1074, 1146, 1222, 1306 |
| `rgba(255,255,255,0.01)` | 9 | .audit-timeline, .audit-detail, .audit-diff-row, .notification-list, .section-nav | 1065, 1104, 1123, 1337, 1377, 1487 |
| `rgba(255,255,255,0.16)` | 8 | .badge, .toast, .toast.success, .toast.warn, .toast.error | 157, 806, 822, 826, 830, 865 |
| `rgba(255,255,255,0.2)` | 7 | .list li:hover, .risk-timeline li:hover, .audit-timeline-item:hover, .risk-trend-track, .section-nav | 911, 1028, 1088, 1225, 1378, 1637 |
| `rgba(255,255,255,0.03)` | 6 | .btn.danger:hover, .modal-input, .toast-close, .audit-diff-value, .template-variable-chip | 371, 757, 856, 1145, 1557, 1565 |
| `#86d3a0` | 5 | .toast.success .toast-title, .sla-ok, .kpi-meta.ok, .template-variable-chip.ok, .template-validation-item.good | 845, 973, 978, 1573, 1599 |
| `#f4c56c` | 5 | .toast.warn .toast-title, .sla-warn, .kpi-meta.warn, .template-variable-chip.warn, .template-validation-item.warn | 846, 974, 979, 1577, 1603 |
| `rgba(0, 0, 0, 0.28)` | 5 | :root, tbody tr:hover td, tbody tr:focus-within td, .preview-cta, .staff-row-active td | 68, 478, 485, 1682, 1798 |
| `rgba(0, 0, 0, 0.3)` | 5 | :root, textarea:hover, tr.risk-row-selected td, .section-nav .btn, .team-profile-item | 65, 411, 970, 1388, 1831 |
| `rgba(0, 0, 0, 0.34)` | 5 | :root, .section-nav | 29, 62, 64, 67, 1378 |
| `rgba(0,0,0,0.26)` | 5 | input, select, textarea, thead th, .toast-close, .risk-timeline li:hover, .audit-timeline-item:hover | 402, 440, 865, 1028, 1088 |
| `rgba(255, 255, 255, 0.01)` | 5 | .risk-detail-card, .overview-card, .setting-preview, .team-summary-item, .team-profile-card | 996, 1194, 1623, 1716, 1750 |
| `rgba(255, 255, 255, 0.14)` | 5 | :root, tbody td, .table-toolbar, .modal-input | 62, 64, 459, 626, 763 |
| `rgba(255, 255, 255, 0.16)` | 5 | :root, input, select, textarea, .modal-dialog, .audit-diff-value, .team-profile-item | 63, 402, 711, 1138, 1831 |
| `rgba(255,255,255,0.02)` | 5 | .panel::before, .btn.danger, .glass-action-row, .section-nav .btn, .preview-swatch | 114, 365, 1306, 1386, 1660 |
| `rgba(255,255,255,0.24)` | 5 | thead th, .risk-timeline li:hover, .form-block-grid, .glass-action-row, .section-nav .btn | 440, 1026, 1267, 1308, 1388 |
| `rgba(0, 0, 0, 0.24)` | 4 | :root, tbody td, .table-wrap thead th, .modal-input | 64, 459, 529, 763 |
| `rgba(0,0,0,0.24)` | 4 | .form-block-grid > div, .glass-toolbar label.mini, .template-variable-chip.btn, .preview-logo | 1278, 1317, 1567, 1639 |
| `rgba(0,0,0,0.38)` | 4 | .toast, .toast.success, .toast.warn, .toast.error | 806, 822, 826, 830 |
| `rgba(235, 220, 207, 0.08)` | 4 | :root, .drawer-header, .card-header | 51, 69, 684, 924 |
| `rgba(255,255,255,0.12)` | 4 | .panel::before, .btn.danger:hover, .code-block, .template-variable-chip.btn | 114, 371, 962, 1565 |
| `rgba(255,255,255,0.18)` | 4 | .btn::after, .toast-close:hover, .form-block-grid > div, .form-block-grid textarea | 305, 872, 1278, 1294 |
| `#50c878` | 3 | :root, .badge.ok .dot, .risk-trend-fill.level-1 | 13, 635, 1233 |
| `#e46b6b` | 3 | :root, .badge.bad .dot, .risk-trend-fill.level-5 | 15, 637, 1237 |
| `#f2b84b` | 3 | :root, .badge.warn .dot, .risk-trend-fill.level-3 | 14, 636, 1235 |
| `rgba(0, 0, 0, 0.26)` | 3 | body, .table-toolbar, .list li:hover | 80, 626, 911 |
| `rgba(0,0,0,0.18)` | 3 | .panel::after, .value, .risk-trend-track | 126, 147, 1225 |
| `rgba(0,0,0,0.22)` | 3 | .badge, .risk-timeline li, .audit-timeline-item | 158, 1019, 1074 |
| `rgba(0,0,0,0.28)` | 3 | .code-block, .audit-timeline-item.active, .form-block-grid textarea | 962, 1083, 1294 |
| `rgba(202, 186, 174, 0.58)` | 3 | tr.risk-row-selected td, .audit-timeline-item.active | 968, 969, 1081 |
| `rgba(235, 220, 207, 0.10)` | 3 | :root, .btn.btn-ghost, .card | 50, 335, 918 |
| `rgba(235, 220, 207, 0.14)` | 3 | :root, .table-wrap | 20, 57, 493 |
| `rgba(247, 224, 199, 0.9)` | 3 | .template-validation-item, .team-summary-item .label, .team-profile-item .label | 1594, 1719, 1774 |
| `rgba(255, 255, 255, 0.02)` | 3 | .form-block-grid, .form-block-grid > div, .team-profile-item | 1265, 1277, 1770 |
| `rgba(255, 255, 255, 0.22)` | 3 | textarea:focus-visible, tr.risk-row-selected td, .glass-toolbar label.mini | 384, 970, 1313 |
| `rgba(255,255,255,0.04)` | 3 | .badge, .risk-trend-track, .preview-cta.secondary | 157, 1222, 1687 |
| `rgba(255,255,255,0.1)` | 3 | .btn[disabled], .btn.danger, .section-nav .btn | 358, 365, 1386 |
| `rgba(255,255,255,0.11)` | 3 | .modal-input, .audit-diff-value, .template-variable-chip | 757, 1145, 1557 |
| `rgba(255,255,255,0)` | 3 | .panel::before, .btn::after, .section-nav .btn.active | 114, 305, 1393 |
| `#2a2a2a` | 2 | :root, body | 3, 82 |
| `#fdf6f4` | 2 | .btn.btn-secondary, .btn.btn-ghost | 330, 336 |
| `#ff9191` | 2 | .sla-critical, .kpi-meta.bad | 975, 980 |
| `#ff9f9f` | 2 | .template-variable-chip.bad, .template-validation-item.bad | 1581, 1607 |
| `#ffb2b2` | 2 | .modal-hint.error, .toast.error .toast-title | 779, 847 |
| `rgba(0, 0, 0, 0.32)` | 2 | textarea:focus-visible, .team-profile-item:hover | 383, 1884 |
| `rgba(0, 0, 0, 0.4)` | 2 | :root | 63, 66 |
| `rgba(0,0,0,0.2)` | 2 | .audit-diff-value, .template-variable-chip | 1146, 1558 |
| `rgba(122, 162, 255, 0.52)` | 2 | .staff-row-active td | 1795, 1796 |
| `rgba(18, 20, 25, 0.62)` | 2 | body | 81, 81 |
| `rgba(202, 186, 174, 0.08)` | 2 | tr.risk-row-selected td, .audit-timeline-item.active | 967, 1082 |
| `rgba(202, 186, 174, 0.26)` | 2 | tr.risk-row-selected td, .audit-timeline-item.active | 967, 1082 |
| `rgba(202, 186, 174, 0.5)` | 2 | tbody tr:focus-within td | 481, 482 |
| `rgba(235, 220, 207, 0.12)` | 2 | .panel, .drawer | 99, 668 |
| `rgba(244, 197, 108, 0.55)` | 2 | .template-variable-chip.warn, .template-validation-item.warn | 1576, 1602 |
| `rgba(255, 120, 120, 0.7)` | 2 | .template-variable-chip.bad, .template-validation-item.bad | 1580, 1606 |
| `rgba(255, 238, 217, 0.3)` | 2 | tbody td | 456, 457 |
| `rgba(255, 241, 228, 0.34)` | 2 | thead th | 436, 437 |
| `rgba(255, 244, 232, 0.98)` | 2 | .section-nav .btn, .quick-actions .btn | 1383, 1453 |
| `rgba(255, 246, 236, 0.14)` | 2 | .table-wrap tbody tr td:last-child | 579, 580 |
| `rgba(255, 246, 236, 0.18)` | 2 | .table-wrap thead th:first-child, .table-wrap thead th:last-child | 533, 538 |
| `rgba(255, 255, 255, 0.12)` | 2 | .risk-timeline li, .audit-timeline-item | 1014, 1068 |
| `rgba(255, 255, 255, 0.18)` | 2 | :root, .table-wrap thead th | 65, 529 |
| `rgba(255, 255, 255, 0.3)` | 2 | .section-nav .btn.active, .team-profile-item:hover | 1396, 1883 |
| `rgba(255, 255, 255, 0)` | 2 | .admin-brand-mark-shell::before, .table-wrap::before | 200, 507 |
| `rgba(255,255,255,0.22)` | 2 | textarea:hover, .audit-timeline-item.active | 411, 1083 |
| `rgba(255,255,255,0.32)` | 2 | .btn.danger, .section-nav .btn.active | 365, 1393 |
| `rgba(42, 42, 42, 0)` | 2 | body | 81, 81 |
| `rgba(43, 37, 33, 0.74)` | 2 | .table-wrap thead th, .section-nav .btn | 523, 1387 |
| `rgba(74, 64, 57, 0.82)` | 2 | .table-wrap thead th, .section-nav .btn | 523, 1387 |
| `rgba(86, 197, 128, 0.5)` | 2 | .template-variable-chip.ok, .template-validation-item.good | 1572, 1598 |
| `#1a1411` | 1 | :root | 12 |
| `#202020` | 1 | body | 82 |
| `#252525` | 1 | body | 82 |
| `#272018` | 1 | .template-category-chips .btn.active | 1446 |
| `#67a9ff` | 1 | .risk-trend-fill.level-2 | 1234 |
| `#d7deea` | 1 | .code-block | 960 |
| `#deb590` | 1 | :root | 10 |
| `#ecccb0` | 1 | :root | 11 |
| `#ef8b63` | 1 | .risk-trend-fill.level-4 | 1236 |
| `#f7f3ef` | 1 | :root | 7 |
| `#ff5f5f` | 1 | .sla-breached | 976 |
| `#ffd7d7` | 1 | .btn.danger | 363 |
| `#fff4e8` | 1 | .value | 147 |
| `#fff6ea` | 1 | input, select, textarea | 398 |
| `#fff8ef` | 1 | .form-block-grid textarea | 1293 |
| `rgba(0, 0, 0, 0.2)` | 1 | .btn[disabled] | 358 |
| `rgba(0, 0, 0, 0.22)` | 1 | .list li | 900 |
| `rgba(0, 0, 0, 0.33)` | 1 | .section-nav .btn.active | 1396 |
| `rgba(0, 0, 0, 0.35)` | 1 | :root | 32 |
| `rgba(0, 0, 0, 0.42)` | 1 | :root | 65 |
| `rgba(0, 0, 0, 0.44)` | 1 | :root | 71 |
| `rgba(0, 0, 0, 0.48)` | 1 | :root | 33 |
| `rgba(0, 0, 0, 0.5)` | 1 | :root | 62 |
| `rgba(0, 0, 0, 0.52)` | 1 | :root | 29 |
| `rgba(0, 0, 0, 0.55)` | 1 | .drawer-backdrop | 696 |
| `rgba(0, 0, 0, 0.56)` | 1 | :root | 63 |
| `rgba(0, 0, 0, 0.65)` | 1 | .drawer | 669 |
| `rgba(0,0,0,0.04)` | 1 | .panel::after | 126 |
| `rgba(0,0,0,0.32)` | 1 | .glass-action-row | 1308 |
| `rgba(0,0,0,0.34)` | 1 | .form-block-grid | 1267 |
| `rgba(0,0,0,0.48)` | 1 | .modal-dialog | 711 |
| `rgba(119, 68, 70, 0.84)` | 1 | .btn.danger | 366 |
| `rgba(12, 14, 20, 0.7)` | 1 | .code-block | 953 |
| `rgba(12,14,20,0.72)` | 1 | .preview-logo | 1638 |
| `rgba(122, 162, 255, 0.06)` | 1 | .staff-row-active td | 1797 |
| `rgba(122, 162, 255, 0.22)` | 1 | .staff-row-active td | 1797 |
| `rgba(136, 75, 79, 0.88)` | 1 | .btn.danger:hover | 372 |
| `rgba(158, 132, 111, 0.22)` | 1 | [data-section-group="auditSection"] | 1413 |
| `rgba(16, 18, 25, 0.86)` | 1 | .code-block | 953 |
| `rgba(16,18,25,0.9)` | 1 | .preview-logo | 1638 |
| `rgba(172, 129, 103, 0.26)` | 1 | #incidentsQueueSection | 1419 |
| `rgba(172, 146, 120, 0.23)` | 1 | [data-section-group="teamSection"] | 1414 |
| `rgba(18, 20, 24, 0.64)` | 1 | .table-wrap tbody td | 545 |
| `rgba(185, 151, 118, 0.21)` | 1 | [data-section-group="settingsSection"] | 1415 |
| `rgba(186, 150, 116, 0.24)` | 1 | #reviewsQueueSection | 1418 |
| `rgba(187, 150, 116, 0.24)` | 1 | #riskLabSection | 1417 |
| `rgba(19, 16, 15, 0.72)` | 1 | .modal-dialog | 710 |
| `rgba(194, 170, 156, 0.22)` | 1 | :root | 35 |
| `rgba(194, 170, 156, 0.3)` | 1 | .btn.active | 345 |
| `rgba(194, 170, 156, 0.30)` | 1 | .chip.is-active | 949 |
| `rgba(194, 170, 156, 0.92)` | 1 | .btn.btn-primary | 320 |
| `rgba(195, 159, 126, 0.24)` | 1 | [data-section-group="reviewsIncidentsSection"] | 1412 |
| `rgba(20, 22, 26, 0.76)` | 1 | .table-wrap tbody tr:hover td | 564 |
| `rgba(201, 152, 108, 0.22)` | 1 | [data-section-group="templateLifecycleSection"] | 1411 |
| `rgba(202, 186, 174, 0.18)` | 1 | .modal-backdrop | 651 |
| `rgba(202, 186, 174, 0.24)` | 1 | .preview-cta | 1680 |
| `rgba(202, 186, 174, 0.3)` | 1 | tbody tr:focus-within td | 484 |
| `rgba(202, 186, 174, 0.48)` | 1 | .preview-cta.secondary | 1688 |
| `rgba(202, 186, 174, 0.56)` | 1 | .preview-cta | 1680 |
| `rgba(202, 186, 174, 0.82)` | 1 | .preview-cta | 1674 |
| `rgba(202, 186, 174, 0.88)` | 1 | textarea:focus-visible | 380 |
| `rgba(210, 166, 121, 0.23)` | 1 | [data-section-group="opsSection"] | 1416 |
| `rgba(214, 173, 132, 0.09)` | 1 | body | 79 |
| `rgba(214, 173, 132, 0.2)` | 1 | [data-section-group="overviewSection"] | 1410 |
| `rgba(214, 173, 132, 0.34)` | 1 | .section-nav .btn.active | 1394 |
| `rgba(214, 173, 132, 0.5)` | 1 | .section-nav .btn.active | 1396 |
| `rgba(214, 173, 132, 0.72)` | 1 | .section-nav .btn.active | 1394 |
| `rgba(214, 173, 132, 0.94)` | 1 | .section-nav .btn.active | 1395 |
| `rgba(223, 205, 188, 0.24)` | 1 | :root | 9 |
| `rgba(228, 107, 107, 0.26)` | 1 | .toast.error | 830 |
| `rgba(228, 107, 107, 0.35)` | 1 | .modal-input.input-error | 769 |
| `rgba(228, 107, 107, 0.65)` | 1 | .toast.error | 829 |
| `rgba(228, 107, 107, 0.75)` | 1 | .modal-input.input-error | 768 |
| `rgba(23, 19, 18, 0.74)` | 1 | .toast | 805 |
| `rgba(23, 26, 31, 0.78)` | 1 | :root | 5 |
| `rgba(232, 221, 213, 0.82)` | 1 | :root | 55 |
| `rgba(233, 210, 190, 0.3)` | 1 | input, select, textarea | 397 |
| `rgba(233, 223, 213, 0.9)` | 1 | :root | 8 |
| `rgba(234, 132, 132, 0.56)` | 1 | .btn.danger | 362 |
| `rgba(234, 67, 53, 0.08)` | 1 | .audit-diff-value.before | 1152 |
| `rgba(234, 67, 53, 0.2)` | 1 | .audit-diff-value.before | 1152 |
| `rgba(234, 67, 53, 0.4)` | 1 | .audit-diff-value.before | 1151 |
| `rgba(235, 201, 165, 0.3)` | 1 | .section-nav .btn.active | 1396 |
| `rgba(235, 220, 207, 0.18)` | 1 | :root | 35 |
| `rgba(235, 220, 207, 0.2)` | 1 | .panel:hover | 132 |
| `rgba(235, 220, 207, 0.24)` | 1 | .btn.btn-primary | 321 |
| `rgba(235, 220, 207, 0)` | 1 | :root | 70 |
| `rgba(236, 204, 176, 0.42)` | 1 | :root | 59 |
| `rgba(236, 212, 191, 0.52)` | 1 | textarea:hover | 409 |
| `rgba(238, 154, 154, 0.68)` | 1 | .btn.danger:hover | 369 |
| `rgba(24, 24, 24, 0.94)` | 1 | .drawer | 667 |
| `rgba(241, 219, 198, 0.34)` | 1 | .form-block-grid | 1261 |
| `rgba(241, 219, 198, 0.36)` | 1 | .glass-action-row | 1302 |
| `rgba(242, 184, 75, 0.22)` | 1 | .toast.warn | 826 |
| `rgba(242, 184, 75, 0.55)` | 1 | .toast.warn | 825 |
| `rgba(244, 197, 108, 0.5)` | 1 | .sla-warn | 974 |
| `rgba(244, 223, 202, 0.42)` | 1 | .form-block-grid textarea | 1291 |
| `rgba(244, 224, 205, 0.34)` | 1 | .form-block-grid > div | 1273 |
| `rgba(245, 214, 182, 0.2)` | 1 | .table-toolbar | 623 |
| `rgba(245, 214, 182, 0.24)` | 1 | .section-nav | 1374 |
| `rgba(245, 214, 182, 0.42)` | 1 | .quick-actions .btn | 1452 |
| `rgba(245, 214, 182, 0.44)` | 1 | .section-nav .btn | 1384 |
| `rgba(245, 226, 206, 0.78)` | 1 | .form-block-grid textarea::placeholder | 1298 |
| `rgba(246, 241, 238, 0.34)` | 1 | .toast-close:hover | 871 |
| `rgba(247, 226, 202, 0.88)` | 1 | .mini | 393 |
| `rgba(249, 226, 200, 0.9)` | 1 | .notification-detail | 1362 |
| `rgba(250, 230, 210, 0.96)` | 1 | .form-block-grid > div > label | 1284 |
| `rgba(253, 246, 244, 0.06)` | 1 | :root | 34 |
| `rgba(253, 246, 244, 0.10)` | 1 | :root | 21 |
| `rgba(253, 246, 244, 0.92)` | 1 | :root | 54 |
| `rgba(253, 246, 244, 0.95)` | 1 | :root | 53 |
| `rgba(255, 145, 145, 0.6)` | 1 | .sla-critical | 975 |
| `rgba(255, 226, 197, 0.74)` | 1 | textarea::placeholder | 420 |
| `rgba(255, 234, 211, 0.96)` | 1 | .badge | 153 |
| `rgba(255, 241, 227, 0.96)` | 1 | h3 | 145 |
| `rgba(255, 241, 228, 0.94)` | 1 | thead th | 433 |
| `rgba(255, 242, 229, 0.2)` | 1 | .table-wrap tbody td | 544 |
| `rgba(255, 246, 236, 0.2)` | 1 | .table-wrap thead th | 526 |
| `rgba(255, 246, 236, 0.32)` | 1 | .table-wrap thead th | 525 |
| `rgba(255, 247, 236, 0.28)` | 1 | .table-wrap tbody tr:hover td | 563 |
| `rgba(255, 255, 255, 0.03)` | 1 | .admin-brand-mark-shell::before | 200 |
| `rgba(255, 255, 255, 0.07)` | 1 | body | 78 |
| `rgba(255, 255, 255, 0.08)` | 1 | .table-wrap::before | 507 |
| `rgba(255, 255, 255, 0.09)` | 1 | .admin-brand-mark-shell::before | 200 |
| `rgba(255, 255, 255, 0.1)` | 1 | .risk-trend-track | 1224 |
| `rgba(255, 255, 255, 0.11)` | 1 | .form-block-grid > div | 1277 |
| `rgba(255, 255, 255, 0.13)` | 1 | .list li | 894 |
| `rgba(255, 255, 255, 0.15)` | 1 | .form-block-grid | 1265 |
| `rgba(255, 255, 255, 0.24)` | 1 | .audit-timeline-item:hover | 1086 |
| `rgba(255, 255, 255, 0.25)` | 1 | .list li:hover | 909 |
| `rgba(255, 95, 95, 0.12)` | 1 | .sla-breached | 976 |
| `rgba(255, 95, 95, 0.8)` | 1 | .sla-breached | 976 |
| `rgba(255,255,255,0.05)` | 1 | .team-profile-item::before | 1854 |
| `rgba(255,255,255,0.06)` | 1 | .toast-close:hover | 872 |
| `rgba(255,255,255,0.07)` | 1 | .section-nav .btn.active | 1393 |
| `rgba(255,255,255,0.09)` | 1 | .section-nav | 1377 |
| `rgba(255,255,255,0.13)` | 1 | .toast-close | 856 |
| `rgba(255,255,255,0.15)` | 1 | .list li | 900 |
| `rgba(255,255,255,0.25)` | 1 | .preview-swatch-dot | 1666 |
| `rgba(255,255,255,0.28)` | 1 | .section-nav .btn | 1386 |
| `rgba(255,255,255,0.34)` | 1 | .preview-cta | 1682 |
| `rgba(255,255,255,0.38)` | 1 | .btn.danger:hover | 371 |
| `rgba(26, 30, 37, 0.54)` | 1 | .table-wrap | 491 |
| `rgba(26, 30, 37, 0.78)` | 1 | .panel | 98 |
| `rgba(30, 34, 40, 0.74)` | 1 | :root | 6 |
| `rgba(31, 31, 31, 0.86)` | 1 | :root | 52 |
| `rgba(32, 28, 27, 0.84)` | 1 | .modal-dialog | 710 |
| `rgba(33, 30, 32, 0.76)` | 1 | .section-nav | 1376 |
| `rgba(33, 36, 42, 0.20)` | 1 | :root | 48 |
| `rgba(33, 36, 42, 0.7)` | 1 | :root | 24 |
| `rgba(33, 37, 44, 0.66)` | 1 | .table-wrap tbody tr:nth-child(even) td | 559 |
| `rgba(35, 30, 27, 0.66)` | 1 | .table-toolbar | 622 |
| `rgba(35, 35, 35, 0.70)` | 1 | :root | 46 |
| `rgba(35, 35, 35, 0.92)` | 1 | .card | 917 |
| `rgba(36, 32, 29, 0.68)` | 1 | .form-block-grid textarea | 1292 |
| `rgba(36, 39, 45, 0.68)` | 1 | :root | 26 |
| `rgba(37, 41, 48, 0.7)` | 1 | .table-wrap tbody tr:nth-child(odd) td | 556 |
| `rgba(38, 41, 49, 0.74)` | 1 | input, select, textarea | 396 |
| `rgba(39, 43, 51, 0.86)` | 1 | .panel | 98 |
| `rgba(40, 44, 50, 0.86)` | 1 | :root | 4 |
| `rgba(41, 34, 29, 0.72)` | 1 | .glass-toolbar label.mini | 1316 |
| `rgba(42, 47, 56, 0.5)` | 1 | .table-wrap | 491 |
| `rgba(43, 37, 32, 0.5)` | 1 | .form-block-grid > div | 1276 |
| `rgba(43, 38, 36, 0.84)` | 1 | .toast | 805 |
| `rgba(43, 46, 53, 0.76)` | 1 | :root | 28 |
| `rgba(44, 38, 34, 0.7)` | 1 | .form-block-grid | 1264 |
| `rgba(44, 39, 35, 0.68)` | 1 | .glass-action-row | 1305 |
| `rgba(44,36,31,0.72)` | 1 | thead th | 439 |
| `rgba(47, 51, 59, 0.8)` | 1 | textarea:hover | 410 |
| `rgba(48, 48, 48, 0.22)` | 1 | .btn.btn-ghost:hover | 341 |
| `rgba(48, 48, 48, 0.28)` | 1 | :root | 18 |
| `rgba(48, 48, 48, 0.40)` | 1 | :root | 56 |
| `rgba(48, 48, 48, 0.42)` | 1 | :root | 19 |
| `rgba(52, 168, 83, 0.08)` | 1 | .audit-diff-value.after | 1156 |
| `rgba(52, 168, 83, 0.2)` | 1 | .audit-diff-value.after | 1156 |
| `rgba(52, 168, 83, 0.4)` | 1 | .audit-diff-value.after | 1155 |
| `rgba(52, 56, 64, 0.28)` | 1 | :root | 47 |
| `rgba(52, 56, 64, 0.84)` | 1 | :root | 23 |
| `rgba(54, 59, 69, 0.78)` | 1 | .table-wrap tbody tr:nth-child(even) td | 559 |
| `rgba(56, 48, 42, 0.72)` | 1 | .table-toolbar | 622 |
| `rgba(58, 50, 43, 0.72)` | 1 | .section-nav | 1376 |
| `rgba(59, 63, 72, 0.84)` | 1 | :root | 25 |
| `rgba(62, 55, 49, 0.76)` | 1 | .form-block-grid textarea | 1292 |
| `rgba(62, 67, 77, 0.82)` | 1 | .table-wrap tbody tr:nth-child(odd) td | 556 |
| `rgba(66, 71, 82, 0.68)` | 1 | input, select, textarea | 396 |
| `rgba(71, 58, 50, 0.74)` | 1 | .glass-toolbar label.mini | 1316 |
| `rgba(74, 63, 55, 0.64)` | 1 | .form-block-grid > div | 1276 |
| `rgba(74, 64, 57, 0.78)` | 1 | .glass-action-row | 1305 |
| `rgba(75, 81, 93, 0.76)` | 1 | textarea:hover | 410 |
| `rgba(77, 82, 92, 0.36)` | 1 | :root | 49 |
| `rgba(77, 82, 92, 0.9)` | 1 | :root | 27 |
| `rgba(78, 68, 61, 0.8)` | 1 | .form-block-grid | 1264 |
| `rgba(78,63,53,0.78)` | 1 | thead th | 439 |
| `rgba(8, 11, 16, 0.66)` | 1 | .modal-backdrop | 652 |
| `rgba(80, 200, 120, 0.22)` | 1 | .toast.success | 822 |
| `rgba(80, 200, 120, 0.45)` | 1 | .toast.success | 821 |
| `rgba(82, 44, 47, 0.74)` | 1 | .btn.danger | 366 |
| `rgba(86, 197, 128, 0.45)` | 1 | .sla-ok | 973 |
| `rgba(94, 110, 136, 0.09)` | 1 | :root | 60 |
| `rgba(97, 50, 54, 0.78)` | 1 | .btn.danger:hover | 372 |

## 3) Visuell palett

- SVG: `docs/major-arcana-color-palette.svg`
- PNG: `docs/major-arcana-color-palette.png`
