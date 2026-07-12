#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const JSZip = require('jszip');
const XLSX = require('@e965/xlsx');

const BASE_URL = process.env.CCO_ATTACHMENT_BASE_URL || 'http://127.0.0.1:3102';
const outputDir = path.join(process.cwd(), 'artifacts', 'cco-attachment-preview');
fs.mkdirSync(outputDir, { recursive: true });

async function makeDocx() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Patientinformation</w:t></w:r></w:p><w:p><w:r><w:t>Detta Word-dokument visas lokalt i CCO utan extern tjänst.</w:t></w:r></w:p></w:body></w:document>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

function makeXlsx() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Patient', 'Behandling', 'Status'],
    ['Anna Karlsson', 'PRP', 'Bokad'],
    ['Fazli Test', 'DHI', 'Klar'],
  ]), 'Översikt');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Datum', 'Anteckning'], ['2026-07-12', 'Visuell QA']]), 'Historik');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

async function makePptx() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>');
  zip.file('ppt/slides/slide1.xml', '<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Hair TP Clinic</a:t></a:r></a:p><a:p><a:r><a:t>PowerPoint visas sida för sida i CCO.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function openFixture(page, fixture) {
  await page.goto(`${BASE_URL}/konversationer.html?embed=admin`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((item) => window.openMailAttachmentPreview({ dataset: item }), fixture);
  await page.locator('.mail-preview-loading').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  await page.locator('.mail-preview-dialog').waitFor({ state: 'visible' });
  const error = await page.locator('.mail-preview-unavailable').textContent().catch(() => '');
  if (error) throw new Error(`${fixture.mailPreviewName}: ${error}`);
}

async function runBrowser(name, browserType, fixtures) {
  const browser = await browserType.launch({ headless: true });
  try {
    for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      for (const fixture of fixtures) {
        process.stdout.write(`${name} ${viewport.name} ${fixture.kind}\n`);
        await openFixture(page, fixture);
        await page.screenshot({ path: path.join(outputDir, `${name}-${viewport.name}-${fixture.kind}.png`), fullPage: false });
        await page.locator('.mail-preview-close').click();
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const fixtureDir = path.join(process.cwd(), 'public', '__attachment-qa__');
  fs.mkdirSync(fixtureDir, { recursive: true });
  const docx = await makeDocx();
  const xlsx = makeXlsx();
  const pptx = await makePptx();
  fs.writeFileSync(path.join(fixtureDir, 'patientinformation.docx'), docx);
  fs.writeFileSync(path.join(fixtureDir, 'kundlista.xlsx'), xlsx);
  fs.writeFileSync(path.join(fixtureDir, 'kliniken.pptx'), pptx);
  fs.writeFileSync(path.join(fixtureDir, 'patientvideo.mp4'), Buffer.from('AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29t', 'base64'));
  fs.writeFileSync(path.join(fixtureDir, 'rostmeddelande.mp3'), Buffer.from('SUQzAwAAAAAA', 'base64'));
  const fixtures = [
    { kind: 'word', mailPreviewName: 'patientinformation.docx', mailPreviewType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', mailPreviewImage: 'false', mailPreviewUrl: `${BASE_URL}/__attachment-qa__/patientinformation.docx` },
    { kind: 'excel', mailPreviewName: 'kundlista.xlsx', mailPreviewType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', mailPreviewImage: 'false', mailPreviewUrl: `${BASE_URL}/__attachment-qa__/kundlista.xlsx` },
    { kind: 'powerpoint', mailPreviewName: 'kliniken.pptx', mailPreviewType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', mailPreviewImage: 'false', mailPreviewUrl: `${BASE_URL}/__attachment-qa__/kliniken.pptx` },
    { kind: 'video', mailPreviewName: 'patientvideo.mp4', mailPreviewType: 'video/mp4', mailPreviewImage: 'false', mailPreviewUrl: `${BASE_URL}/__attachment-qa__/patientvideo.mp4` },
    { kind: 'audio', mailPreviewName: 'röstmeddelande.mp3', mailPreviewType: 'audio/mpeg', mailPreviewImage: 'false', mailPreviewUrl: `${BASE_URL}/__attachment-qa__/rostmeddelande.mp3` },
  ];
  try {
    await runBrowser('chromium', chromium, fixtures);
    await runBrowser('webkit', webkit, fixtures);
    process.stdout.write(`PASS: Chromium + WebKit, desktop + mobile. Screenshots: ${outputDir}\n`);
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
