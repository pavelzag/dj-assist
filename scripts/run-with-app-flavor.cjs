const { spawn } = require('node:child_process');
const path = require('node:path');

function main() {
  const [, , flavorArg, scriptName] = process.argv;
  const rawFlavor = String(flavorArg || '').trim().toLowerCase();
  const flavor =
    rawFlavor === 'pro-prod' || rawFlavor === 'pro'
      ? 'pro-prod'
      : rawFlavor === 'free-prod' || rawFlavor === 'free' || rawFlavor === 'prod'
        ? 'free-prod'
        : rawFlavor === 'debug'
          ? 'debug'
          : '';
  const targetScript = String(scriptName || '').trim();

  if (!flavor || !targetScript) {
    console.error('Usage: node scripts/run-with-app-flavor.cjs <debug|free-prod|pro-prod> <npm-script>');
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
