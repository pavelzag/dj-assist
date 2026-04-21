const path = require('node:path');
const { loadEnvConfig } = require('@next/env');

function loadProjectEnv() {
  const projectDir = path.join(__dirname, '..');
  loadEnvConfig(projectDir, false);
  return projectDir;
}

module.exports = {
  loadProjectEnv,
};
