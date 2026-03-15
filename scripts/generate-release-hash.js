#!/usr/bin/env node
/**
 * Generate latest.json + hashes.txt from local build output.
 * Usage: node scripts/generate-release-hash.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const pkg = require('../package.json');
const releaseDir = path.join(__dirname, '..', 'release');

function sha256(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function findFile(dir, ext) {
  if (!fs.existsSync(dir)) return null;
  return fs.readdirSync(dir).find(f => f.endsWith(ext));
}

const platforms = {};
const hashes = [];

const macFile = findFile(releaseDir, '.dmg');
if (macFile) {
  const fp = path.join(releaseDir, macFile);
  const hash = sha256(fp);
  platforms.mac = { sha256: hash, size: fs.statSync(fp).size };
  hashes.push(`${hash}  ${macFile}`);
}

const winFile = findFile(releaseDir, '.exe');
if (winFile) {
  const fp = path.join(releaseDir, winFile);
  const hash = sha256(fp);
  platforms.win = { sha256: hash, size: fs.statSync(fp).size };
  hashes.push(`${hash}  ${winFile}`);
}

const linuxFile = findFile(releaseDir, '.AppImage');
if (linuxFile) {
  const fp = path.join(releaseDir, linuxFile);
  const hash = sha256(fp);
  platforms.linux = { sha256: hash, size: fs.statSync(fp).size };
  hashes.push(`${hash}  ${linuxFile}`);
}

const latestJson = {
  version: pkg.version,
  releaseDate: new Date().toISOString(),
  releaseNotes: 'Bug fixes and improvements.',
  platforms,
};

fs.writeFileSync(path.join(releaseDir, 'latest.json'), JSON.stringify(latestJson, null, 2));
fs.writeFileSync(path.join(releaseDir, 'hashes.txt'), hashes.join('\n') + '\n');

console.log('Generated latest.json:', JSON.stringify(latestJson, null, 2));
console.log('Generated hashes.txt:', hashes.join('\n'));
