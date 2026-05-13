const fs = require('node:fs');
const path = require('node:path');
const { loadProjectEnv } = require('./load-env.cjs');

const outputPath = path.join(__dirname, '..', 'electron', 'build-env.json');

loadProjectEnv();

function optionalValue(name) {
  const value = String(process.env[name] || '').trim();
  return value || undefined;
}

function normalizeFlavor(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'pro-prod' || raw === 'pro') return 'pro-prod';
  if (raw === 'free-prod' || raw === 'free' || raw === 'prod') return 'free-prod';
  return 'debug';
}

const appFlavor = normalizeFlavor(optionalValue('DJ_ASSIST_APP_FLAVOR') || optionalValue('NEXT_PUBLIC_DJ_ASSIST_APP_FLAVOR') || 'debug');
const buildEnv = {
  DJ_ASSIST_APP_FLAVOR: appFlavor,
  NEXT_PUBLIC_DJ_ASSIST_APP_FLAVOR: appFlavor,
};

if (appFlavor !== 'free-prod') {
  buildEnv.GOOGLE_CLIENT_ID = optionalValue('GOOGLE_CLIENT_ID');
  buildEnv.GOOGLE_CLIENT_SECRET = optionalValue('GOOGLE_CLIENT_SECRET');
  buildEnv.ONEDRIVE_CLIENT_ID = optionalValue('ONEDRIVE_CLIENT_ID');
  buildEnv.ONEDRIVE_CLIENT_SECRET = optionalValue('ONEDRIVE_CLIENT_SECRET');
  buildEnv.DROPBOX_CLIENT_ID = optionalValue('DROPBOX_CLIENT_ID');
  buildEnv.DROPBOX_CLIENT_SECRET = optionalValue('DROPBOX_CLIENT_SECRET');
}

fs.writeFileSync(outputPath, `${JSON.stringify(buildEnv, null, 2)}\n`, 'utf8');
console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
