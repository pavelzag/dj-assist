export type AppPlatform = 'web' | 'electron';

export type PlatformAdapter = {
  platform: AppPlatform;
  supportsNativeFolderPicker: boolean;
  pickDirectory: () => Promise<string | null>;
};

export function createWebPlatformAdapter(): PlatformAdapter {
  return {
    platform: 'web',
    supportsNativeFolderPicker: false,
    pickDirectory: async () => null,
  };
}

export function createElectronPlatformAdapter(): PlatformAdapter {
  return {
    platform: 'electron',
    supportsNativeFolderPicker: true,
    pickDirectory: async () => {
      const desktopApi = (window as Window & {
        djAssistDesktop?: { pickDirectory?: () => Promise<string | null> };
      }).djAssistDesktop;
      if (!desktopApi?.pickDirectory) return null;
      return desktopApi.pickDirectory();
    },
  };
}
