const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('djAssistDesktop', {
  platform: process.platform,
  appUrl: process.env.DJ_ASSIST_ELECTRON_URL || null,
  pickDirectory: () => ipcRenderer.invoke('desktop:pick-directory'),
  showItemInFolder: (targetPath) => ipcRenderer.invoke('desktop:show-item-in-folder', targetPath),
  openExternal: (targetUrl) => ipcRenderer.invoke('desktop:open-external', targetUrl),
  confirmQuit: () => ipcRenderer.invoke('desktop:confirm-quit'),
  cancelQuit: () => ipcRenderer.invoke('desktop:cancel-quit'),
  onQuitRequested: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('desktop:request-quit', handler);
    return () => ipcRenderer.removeListener('desktop:request-quit', handler);
  },
});
