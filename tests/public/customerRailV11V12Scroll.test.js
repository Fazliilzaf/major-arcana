'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const cssPath = path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-v9-customers.css');
const css = fs.readFileSync(cssPath, 'utf8');

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
