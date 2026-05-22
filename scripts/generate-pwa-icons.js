#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const previewDir = path.join(__dirname, '../public/major-arcana-preview');
const svgPath = path.join(previewDir, 'icon.svg');
const icon192 = path.join(previewDir, 'icon-192.png');
const icon512 = path.join(previewDir, 'icon-512.png');

async function generateWithSharp() {
  const sharp = require('sharp');
  const svg = fs.readFileSync(svgPath);
  await sharp(svg).resize(192, 192).png().toFile(icon192);
  await sharp(svg).resize(512, 512).png().toFile(icon512);
}

function generateWithMacTools() {
  const tempThumb = path.join(previewDir, 'icon.svg.png');
  execSync(`qlmanage -t -s 512 -o ${JSON.stringify(previewDir)} ${JSON.stringify(svgPath)}`, {
    stdio: 'ignore',
  });
  if (!fs.existsSync(tempThumb)) {
    throw new Error('qlmanage did not produce icon.svg.png');
  }
  execSync(`sips -z 192 192 ${JSON.stringify(tempThumb)} --out ${JSON.stringify(icon192)}`, {
    stdio: 'ignore',
  });
  execSync(`sips -z 512 512 ${JSON.stringify(tempThumb)} --out ${JSON.stringify(icon512)}`, {
    stdio: 'ignore',
  });
  fs.rmSync(tempThumb, { force: true });
}

async function main() {
  try {
    await generateWithSharp();
  } catch {
    generateWithMacTools();
  }
  console.log('PWA icons generated: icon-192.png, icon-512.png');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
