const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const standaloneRoot = path.join(repoRoot, '.next', 'standalone');
const standaloneNextRoot = path.join(standaloneRoot, '.next');
const sourceStatic = path.join(repoRoot, '.next', 'static');
const targetStatic = path.join(standaloneNextRoot, 'static');
const sourcePublic = path.join(repoRoot, 'public');
const targetPublic = path.join(standaloneRoot, 'public');
const sourceEnvLocal = path.join(repoRoot, '.env.local');
const targetEnvLocal = path.join(standaloneRoot, '.env.local');

function copyTree(source, target) {
  if (!fs.existsSync(source)) return;
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, {
    recursive: true,
    force: true,
    dereference: true,
    preserveTimestamps: true,
  });
}

function main() {
  if (!fs.existsSync(path.join(standaloneRoot, 'server.js'))) {
    throw new Error('Next standalone output not found. Run `npm run build` first.');
  }

  copyTree(sourceStatic, targetStatic);
  copyTree(sourcePublic, targetPublic);
  if (fs.existsSync(sourceEnvLocal)) {
    fs.copyFileSync(sourceEnvLocal, targetEnvLocal);
    console.log(`Prepared standalone env file at ${targetEnvLocal}`);
  }

  console.log(`Prepared standalone static assets at ${targetStatic}`);
  console.log(`Prepared standalone public assets at ${targetPublic}`);
}

main();
