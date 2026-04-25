export type AppPlatform = 'electron';

export type PlatformAdapter = {
  platform: AppPlatform;
  supportsNativeFolderPicker: boolean;
  mediaUrlForPath?: (targetPath: string) => string | null;
  pickDirectory: () => Promise<string | null>;
  openExternal: (targetUrl: string) => Promise<boolean>;
  confirmQuit: () => Promise<boolean>;
  cancelQuit: () => Promise<boolean>;
  onQuitRequested: (callback: () => void) => () => void;
};

export function createElectronPlatformAdapter(): PlatformAdapter {
  return {
    platform: 'electron',
    supportsNativeFolderPicker: true,
    mediaUrlForPath: (targetPath: string) => {
      const desktopApi = (window as Window & {
        djAssistDesktop?: {
          mediaUrlForPath?: (path: string) => string | null;
        };
      }).djAssistDesktop;
      if (!desktopApi?.mediaUrlForPath) return null;
      return desktopApi.mediaUrlForPath(targetPath);
    },
    pickDirectory: async () => {
      const desktopApi = (window as Window & {
        djAssistDesktop?: {
          mediaUrlForPath?: (path: string) => string | null;
          pickDirectory?: () => Promise<string | null>;
          openExternal?: (targetUrl: string) => Promise<boolean>;
          confirmQuit?: () => Promise<boolean>;
          cancelQuit?: () => Promise<boolean>;
          onQuitRequested?: (callback: () => void) => () => void;
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
    confirmQuit: async () => {
      const desktopApi = (window as Window & {
        djAssistDesktop?: { confirmQuit?: () => Promise<boolean> };
      }).djAssistDesktop;
      if (!desktopApi?.confirmQuit) return false;
      return desktopApi.confirmQuit();
    },
    cancelQuit: async () => {
      const desktopApi = (window as Window & {
        djAssistDesktop?: { cancelQuit?: () => Promise<boolean> };
      }).djAssistDesktop;
      if (!desktopApi?.cancelQuit) return false;
      return desktopApi.cancelQuit();
    },
    onQuitRequested: (callback: () => void) => {
      const desktopApi = (window as Window & {
        djAssistDesktop?: { onQuitRequested?: (cb: () => void) => () => void };
      }).djAssistDesktop;
      if (!desktopApi?.onQuitRequested) return () => {};
      return desktopApi.onQuitRequested(callback);
    },
  };
}
