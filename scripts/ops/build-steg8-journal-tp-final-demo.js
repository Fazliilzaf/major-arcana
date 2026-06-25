#!/usr/bin/env node
/** Alias — bygger endast journal_tp (B16). Se build-steg8-staff-journal-demos.js */
'use strict';

require('child_process').execFileSync(
  process.execPath,
  [require('path').join(__dirname, 'build-steg8-staff-journal-demos.js'), 'journal_tp'],
  { stdio: 'inherit' }
);
