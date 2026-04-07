const path = require('node:path');

module.exports = async function notarizeMac(context) {
  if (process.platform !== 'darwin') return;
  const appleId = process.env.APPLE_ID;
  const applePassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  if (!appleId || !applePassword || !teamId) {
    console.log('Skipping mac notarization: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not set');
    return;
  }

  const { notarize } = require('@electron/notarize');
  const appOutDir = context.appOutDir;
  const productFilename = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${productFilename}.app`);

  await notarize({
    appBundleId: context.packager.appInfo.id,
    appPath,
    appleId,
    appleIdPassword: applePassword,
    teamId,
  });
};
