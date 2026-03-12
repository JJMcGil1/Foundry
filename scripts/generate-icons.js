#!/usr/bin/env node
/**
 * Generate PNG + ICNS app icons from the Foundry SVG source.
 * Run: node scripts/generate-icons.js
 */
const { Resvg } = require('@resvg/resvg-js');
const png2icons = require('png2icons');
const fs = require('fs');
const path = require('path');

const SVG_PATH = path.join(__dirname, '..', 'src', 'renderer', 'assets', 'Foundry-App-Icon.svg');
const BUILD_DIR = path.join(__dirname, '..', 'build');

// Ensure build dir exists
if (!fs.existsSync(BUILD_DIR)) fs.mkdirSync(BUILD_DIR, { recursive: true });

const svgData = fs.readFileSync(SVG_PATH, 'utf8');

// Generate 1024x1024 PNG (highest res needed for macOS)
const resvg = new Resvg(svgData, {
  fitTo: { mode: 'width', value: 1024 },
});
const pngData = resvg.render();
const pngBuffer = pngData.asPng();

// Write PNG
const pngPath = path.join(BUILD_DIR, 'icon.png');
fs.writeFileSync(pngPath, pngBuffer);
console.log(`✓ PNG icon: ${pngPath} (${(pngBuffer.length / 1024).toFixed(1)} KB)`);

// Also write a copy into assets for Electron runtime use
const assetPng = path.join(__dirname, '..', 'src', 'renderer', 'assets', 'icon.png');
fs.writeFileSync(assetPng, pngBuffer);
console.log(`✓ Asset PNG: ${assetPng}`);

// Generate ICNS for macOS
const icnsBuffer = png2icons.createICNS(pngBuffer, png2icons.BILINEAR, 0);
if (icnsBuffer) {
  const icnsPath = path.join(BUILD_DIR, 'icon.icns');
  fs.writeFileSync(icnsPath, icnsBuffer);
  console.log(`✓ ICNS icon: ${icnsPath} (${(icnsBuffer.length / 1024).toFixed(1)} KB)`);
}

// Generate ICO for Windows
const icoBuffer = png2icons.createICO(pngBuffer, png2icons.BILINEAR, 0, true);
if (icoBuffer) {
  const icoPath = path.join(BUILD_DIR, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`✓ ICO icon: ${icoPath} (${(icoBuffer.length / 1024).toFixed(1)} KB)`);
}

console.log('\n✅ All icons generated successfully.');
