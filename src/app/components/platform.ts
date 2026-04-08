export type AppPlatform = 'electron';

export type PlatformAdapter = {
  platform: AppPlatform;
  supportsNativeFolderPicker: boolean;
  pickDirectory: () => Promise<string | null>;
  openExternal: (targetUrl: string) => Promise<boolean>;
};

export function createElectronPlatformAdapter(): PlatformAdapter {
  return {
    platform: 'electron',
    supportsNativeFolderPicker: true,
    pickDirectory: async () => {
      const desktopApi = (window as Window & {
        djAssistDesktop?: {
          pickDirectory?: () => Promise<string | null>;
          openExternal?: (targetUrl: string) => Promise<boolean>;
        };
      }).djAssistDesktop;
      if (!desktopApi?.pickDirectory) return null;
      return desktopApi.pickDirectory();
    },
    openExternal: async (targetUrl: string) => {
      const desktopApi = (window as Window & {
        djAssistDesktop?: {
          openExternal?: (url: string) => Promise<boolean>;
        };
      }).djAssistDesktop;
      if (!desktopApi?.openExternal) {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
        return true;
      }
      return desktopApi.openExternal(targetUrl);
    },
  };
}
