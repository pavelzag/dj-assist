const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.join(__dirname, '..');
const sourcePath = path.join(repoRoot, 'iconfull.png');
const outputPngPath = path.join(repoRoot, 'electron', 'assets', 'app-icon.png');

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout || 'unknown error'}`);
  }
}

function readImageSize(imagePath) {
  const result = spawnSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', imagePath], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Could not inspect ${imagePath}:\n${result.stderr || result.stdout || 'unknown error'}`);
  }
  const width = Number((result.stdout.match(/pixelWidth:\s*(\d+)/) || [])[1] || 0);
  const height = Number((result.stdout.match(/pixelHeight:\s*(\d+)/) || [])[1] || 0);
  if (!width || !height) throw new Error(`Could not parse image size for ${imagePath}`);
  return { width, height };
}

function main() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing icon source: ${sourcePath}`);
  }

  const { width, height } = readImageSize(sourcePath);
  const cropSize = Math.min(width, height);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-assist-icon-'));
  const squarePath = path.join(tmpDir, 'icon-square.png');

  try {
    run('sips', ['-c', String(cropSize), String(cropSize), sourcePath, '--out', squarePath]);
    run('sips', ['-z', '1024', '1024', squarePath, '--out', outputPngPath]);
    console.log(`Updated ${path.relative(repoRoot, outputPngPath)} from iconfull.png`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
