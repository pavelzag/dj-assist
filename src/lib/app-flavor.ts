export type AppFlavor = 'debug' | 'prod';

export function appFlavor(): AppFlavor {
  return process.env.NEXT_PUBLIC_DJ_ASSIST_APP_FLAVOR === 'prod' || process.env.DJ_ASSIST_APP_FLAVOR === 'prod'
    ? 'prod'
    : 'debug';
}

export function isProdAppFlavor(): boolean {
  return appFlavor() === 'prod';
}

export function googleFeaturesEnabled(): boolean {
  return !isProdAppFlavor();
}
