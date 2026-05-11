export type AppFlavor = 'debug' | 'free-prod' | 'pro-prod';

export function normalizeAppFlavor(value: unknown): AppFlavor {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'pro-prod' || raw === 'pro') return 'pro-prod';
  if (raw === 'free-prod' || raw === 'free' || raw === 'prod') return 'free-prod';
  return 'debug';
}

export function appFlavor(): AppFlavor {
  return normalizeAppFlavor(process.env.NEXT_PUBLIC_DJ_ASSIST_APP_FLAVOR || process.env.DJ_ASSIST_APP_FLAVOR);
}

export function isProdAppFlavor(): boolean {
  return appFlavor() !== 'debug';
}

export function isDebugAppFlavor(): boolean {
  return appFlavor() === 'debug';
}

export function isFreeProdAppFlavor(): boolean {
  return appFlavor() === 'free-prod';
}

export function isProProdAppFlavor(): boolean {
  return appFlavor() === 'pro-prod';
}

export function proFeaturesEnabled(): boolean {
  return appFlavor() !== 'free-prod';
}

export function googleFeaturesEnabled(): boolean {
  return proFeaturesEnabled();
}
