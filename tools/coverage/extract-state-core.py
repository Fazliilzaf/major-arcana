#!/usr/bin/env python3
"""
Extraherar state-blocket från app.js till app/state-core.js.

Block-gränser:
- Start: "  const __stateMutationStats = { count: 0, ..." (efter Steg 1-extraktionen)
- Slut:  efter window-helper-deklarationerna (__getStateStats, __testStateUi, etc.)

Wrap-pattern:
- Wrap blocket i en IIFE som exponerar state/scheduleRender/renderApp/etc. via window.__AppCore
- Symboler som app.js fortfarande behöver lämnas i app.js som "import" från window.__AppCore
"""
import re, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
APP_JS = os.path.join(ROOT, 'public/major-arcana-preview/app.js')
STATE_CORE = os.path.join(ROOT, 'public/major-arcana-preview/app/state-core.js')

with open(APP_JS) as f:
    src = f.read()
lines = src.split('\n')

# Hitta gränser
start_marker = '  const __stateMutationStats = { count: 0, byKey: Object.create(null) };'
# Slut: hitta sista raden av state-blocket, som är `  }` efter window-helper-blocket.
# Mönster: vi söker efter `  }$` raden EFTER `      return all;`-raden.

start_idx = None
for i, line in enumerate(lines):
    if line == start_marker:
        start_idx = i
        break
if start_idx is None:
    sys.exit('start_marker not found')

# Hitta slut: raden `  }` som följer på `    };` som föller på `      return all;`
end_idx = None
for i in range(start_idx + 1, len(lines)):
    if lines[i] == '      return all;' and lines[i+1] == '    };' and lines[i+2] == '  }':
        end_idx = i + 2
        break
if end_idx is None:
    sys.exit('end_marker not found')

print(f'state-block: lines {start_idx+1} → {end_idx+1} (1-indexed) = {end_idx - start_idx + 1} rader')

state_block = '\n'.join(lines[start_idx:end_idx+1])

# Bygg state-core.js
header = '''/**
 * app/state-core.js — Steg 2+3 av app.js modulrefactor (per APP-JS-MODULE-PLAN.md).
 *
 * Innehåll:
 *  - __stateInternal (state-data-objektet, 550 rader struktur)
 *  - __stateMutationStats, __readUiPath, __writeUiPath, __makeStateView
 *  - 6 view-Proxyer (state.ui, state.selection, state.status, state.prefs,
 *    state.data, state.forms)
 *  - state Proxy med scheduleRender + renderApp + 8 component-renderers
 *
 * Beroenden:
 *  - window.__AppPaths (måste laddas via app/state-paths.js FÖRE denna fil)
 *
 * Exporter (via window.__AppCore):
 *  - state, scheduleRender, renderApp
 *  - __stateInternal, __renderHooks, __renderStats, __stateMutationStats
 *  (de senare exponeras eftersom andra moduler i app.js fortfarande behöver
 *   referera dem direkt — runt 5-10 platser)
 */
(() => {
  'use strict';

  if (!window.__AppPaths) {
    throw new Error('[state-core.js] window.__AppPaths saknas — ladda app/state-paths.js först');
  }
  const __UI_KEY_PATHS = window.__AppPaths.UI;
  const __SELECTION_KEY_PATHS = window.__AppPaths.SELECTION;
  const __STATUS_KEY_PATHS = window.__AppPaths.STATUS;
  const __DATA_KEY_PATHS = window.__AppPaths.DATA;
  const __FORMS_KEY_PATHS = window.__AppPaths.FORMS;
  const __PREFS_KEY_PATHS = window.__AppPaths.PREFS;

'''

footer = '''

  // ============================================================
  // Exporter via window.__AppCore (app.js läser dessa)
  // ============================================================
  window.__AppCore = Object.freeze({
    state,
    scheduleRender,
    renderApp,
    // Mutable refs som app.js sätter/läser:
    __stateInternal,
    __renderHooks,
    __renderStats,
    __stateMutationStats,
  });
})();
'''

# state_block börjar med 2 spaces indentation. Behåll detta.
core_content = header + state_block + footer

with open(STATE_CORE, 'w') as f:
    f.write(core_content)
print(f'Skrev {STATE_CORE}')
print(f'  Storlek: {core_content.count(chr(10))+1} rader')

# Bygg ny app.js: ersätt state-blocket med import-stub
stub = '''  // ====================================================================
  // STATE-CORE — extraherad till app/state-core.js (Steg 2+3 av modulrefactor).
  // Måste laddas FÖRE app.js i index.html.
  // ====================================================================
  if (!window.__AppCore) {
    throw new Error('[app.js] window.__AppCore saknas — säkerställ att app/state-core.js laddas före app.js');
  }
  const {
    state,
    scheduleRender,
    renderApp,
    __stateInternal,
    __renderHooks,
    __renderStats,
    __stateMutationStats,
  } = window.__AppCore;'''

new_lines = lines[:start_idx] + [stub] + lines[end_idx+1:]
new_src = '\n'.join(new_lines)
with open(APP_JS, 'w') as f:
    f.write(new_src)
print(f'Skrev {APP_JS}')
print(f'  Storlek: {new_src.count(chr(10))+1} rader (var {len(lines)})')
print(f'  Diff: {len(lines) - new_src.count(chr(10))-1} rader bort, ersatt med stub')
