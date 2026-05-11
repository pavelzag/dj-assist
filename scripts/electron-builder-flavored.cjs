const { spawnSync } = require('node:child_process');
const path = require('node:path');

function normalizeFlavor(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'pro-prod' || raw === 'pro') return 'pro-prod';
  if (raw === 'free-prod' || raw === 'free' || raw === 'prod') return 'free-prod';
  return 'debug';
}

const flavor = normalizeFlavor(process.env.DJ_ASSIST_APP_FLAVOR || process.env.NEXT_PUBLIC_DJ_ASSIST_APP_FLAVOR);
const flavorLabels = {
  debug: 'Debug',
  'free-prod': 'Free',
  'pro-prod': 'Pro',
};
const appIdSuffixes = {
  debug: 'debug',
  'free-prod': 'free',
  'pro-prod': 'pro',
};

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('Usage: node scripts/electron-builder-flavored.cjs <dir|dmg|zip> [...]');
  process.exit(1);
}

const label = flavorLabels[flavor];
const productName = `DJ Assist ${label}`;
const outputDir = path.join('dist-electron', flavor);
const artifactName = `${productName}-\${version}-\${arch}.\${ext}`;
const appId = `com.djassist.desktop.${appIdSuffixes[flavor]}`;

const result = spawnSync('electron-builder', [
  '--mac',
  ...targets,
  '--publish',
  'never',
  '--config.productName',
  productName,
  '--config.artifactName',
  artifactName,
  '--config.appId',
  appId,
  '--config.directories.output',
  outputDir,
], {
  cwd: path.join(__dirname, '..'),
  env: process.env,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
