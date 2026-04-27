const fs = require('node:fs');
const path = require('node:path');
const { loadProjectEnv } = require('./load-env.cjs');

const outputPath = path.join(__dirname, '..', 'electron', 'build-env.json');

loadProjectEnv();

function optionalValue(name) {
  const value = String(process.env[name] || '').trim();
  return value || undefined;
}

const buildEnv = {
  GOOGLE_CLIENT_ID: optionalValue('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: optionalValue('GOOGLE_CLIENT_SECRET'),
};

fs.writeFileSync(outputPath, `${JSON.stringify(buildEnv, null, 2)}\n`, 'utf8');
console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
