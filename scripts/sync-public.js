const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

const filesToCopy = [
  'index.html',
  'sketch.js',
  'music.js',
  'kmeans.js',
  'spectrogram.js'
];

const directoriesToCopy = [
  'assets'
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removeDirContents(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
}

function copyFileRelative(relPath) {
  const src = path.join(rootDir, relPath);
  const dest = path.join(publicDir, relPath);
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDirectoryRelative(relPath) {
  const srcDir = path.join(rootDir, relPath);
  const destDir = path.join(publicDir, relPath);
  ensureDir(destDir);
  removeDirContents(destDir);

  if (!fs.existsSync(srcDir)) return;
  for (const entry of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, entry);
    const dest = path.join(destDir, entry);
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

ensureDir(publicDir);

for (const relPath of filesToCopy) {
  copyFileRelative(relPath);
}

for (const relPath of directoriesToCopy) {
  copyDirectoryRelative(relPath);
}

console.log(`Synced public bundle to ${publicDir}`);
