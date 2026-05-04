const { spawn } = require('node:child_process');
const path = require('node:path');

function main() {
  const [, , flavorArg, scriptName] = process.argv;
  const flavor = flavorArg === 'prod' ? 'prod' : 'debug';
  const targetScript = String(scriptName || '').trim();

  if (!targetScript) {
    console.error('Usage: node scripts/run-with-app-flavor.cjs <debug|prod> <npm-script>');
    process.exit(1);
  }

  const child = spawn('npm', ['run', targetScript], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      DJ_ASSIST_APP_FLAVOR: flavor,
      NEXT_PUBLIC_DJ_ASSIST_APP_FLAVOR: flavor,
    },
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main();
