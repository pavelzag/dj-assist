const path = require('node:path');

module.exports = async function notarizeMac(context) {
  if (process.platform !== 'darwin') return;
  const teamId = process.env.APPLE_TEAM_ID;
  const appleApiKey = process.env.APPLE_API_KEY;
  const appleApiKeyId = process.env.APPLE_API_KEY_ID;
  const appleApiIssuer = process.env.APPLE_API_ISSUER;
  const appleId = process.env.APPLE_ID;
  const applePassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;

  const { notarize } = require('@electron/notarize');
  const appOutDir = context.appOutDir;
  const productFilename = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${productFilename}.app`);
  const baseOptions = {
    appBundleId: context.packager.appInfo.id,
    appPath,
  };

  if (appleApiKey && appleApiKeyId) {
    await notarize({
      ...baseOptions,
      tool: 'notarytool',
      appleApiKey,
      appleApiKeyId,
      ...(appleApiIssuer ? { appleApiIssuer } : {}),
    });
    return;
  }

  if (appleId && applePassword && teamId) {
    await notarize({
      ...baseOptions,
      tool: 'notarytool',
      appleId,
      appleIdPassword: applePassword,
      teamId,
    });
    return;
  }

  console.log(
    'Skipping mac notarization: provide APPLE_API_KEY + APPLE_API_KEY_ID (+ optional APPLE_API_ISSUER) or APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID'
  );
};
