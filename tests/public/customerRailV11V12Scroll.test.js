'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const cssPath = path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-v9-customers.css');
const v12CssPath = path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-v12-workspace.css');
const css = fs.readFileSync(cssPath, 'utf8');
const v12Css = fs.readFileSync(v12CssPath, 'utf8');

test('dominant kundrail ger V11/V12 samma interna scrollkedja som legacy-kortet', () => {
  assert.match(
    css,
    /\.customers-rail--dominant[\s\S]*?\.patient-master-card\.v11-rail[\s\S]*?\.customers-rail--dominant[\s\S]*?\.v12-workspace[\s\S]*?\{[\s\S]*?flex:\s*1;[\s\S]*?min-height:\s*0;[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/,
    'V11/V12 shellen ska vara flexbarn i dominant rail'
  );
  assert.match(
    css,
    /\.customers-rail--dominant\s+\.v11-rail__scroll[\s\S]*?\.customers-rail--dominant\s+\.v12-workspace__zones[\s\S]*?\{[\s\S]*?flex:\s*1;[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;/,
    'V11/V12 innehållsytor ska äga vertikal scroll'
  );
});

test('stor V12-kundvy i overlay har intern scrollkedja', () => {
  assert.match(
    v12Css,
    /\.v9-dossier-deep--v12-workspace\s+\.v9-dossier-deep__body[\s\S]*?\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-height:\s*0;[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;[\s\S]*?overflow:\s*hidden;/,
    'overlay-body ska vara höjdbegränsat flexskal, inte sidans scrollägare'
  );
  assert.match(
    v12Css,
    /\.v9-dossier-deep--v12-workspace\s+\.v12-workspace[\s\S]*?\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-height:\s*0;[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/,
    'V12-workspace ska kunna krympa i overlayn'
  );
  assert.match(
    v12Css,
    /\.v9-dossier-deep--v12-workspace[\s\S]*?\.v12-workspace__zones\[data-v9-dossier-scroll\][\s\S]*?\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-height:\s*0;[\s\S]*?max-height:\s*none;[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;/,
    'V12-zones ska äga scrollen i stora kundvyn'
  );
  assert.doesNotMatch(
    v12Css,
    /\.v9-dossier-deep--v12-workspace\s+\.v12-workspace[\s\S]*?\{[\s\S]*?min-height:\s*100%;/,
    'overlay-workspace får inte låsas till min-height:100%, då bryts intern scroll'
  );
});
