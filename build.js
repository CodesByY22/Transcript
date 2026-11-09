// TranscriptKit - Build Script
// Packages only production extension files into a clean zip ready for Chrome Web Store.

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const zipFile = path.join(__dirname, 'transcriptkit.zip');

const filesToInclude = [
  'manifest.json',
  'content.js',
  'content-bridge.js',
  'background.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'icons'
];

console.log('Building TranscriptKit package for Chrome Web Store...\n');

// Clean previous outputs
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
if (fs.existsSync(zipFile)) {
  fs.unlinkSync(zipFile);
}

fs.mkdirSync(distDir, { recursive: true });

// Copy production files
for (const item of filesToInclude) {
  const src = path.join(__dirname, item);
  const dest = path.join(distDir, item);
  if (!fs.existsSync(src)) {
    console.error(`Error: Required file or folder "${item}" does not exist!`);
    process.exit(1);
  }
  if (fs.statSync(src).isDirectory()) {
    fs.cpSync(src, dest, { recursive: true });
  } else {
    fs.copyFileSync(src, dest);
  }
  console.log(`✓ Added: ${item}`);
}

// Read version from manifest
const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf-8'));
console.log(`\nVersion: ${manifest.version}`);

// Create zip archive
try {
  if (process.platform === 'win32') {
    execSync(`powershell.exe -Command "$ProgressPreference = 'SilentlyContinue'; Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipFile}' -Force"`);
  } else {
    execSync(`cd "${distDir}" && zip -r "${zipFile}" ./*`);
  }
  console.log(`\n✓ Successfully created production zip: transcriptkit.zip (${(fs.statSync(zipFile).size / 1024).toFixed(1)} KB)`);
} catch (err) {
  console.error('Failed to create zip:', err.message);
  process.exit(1);
}
