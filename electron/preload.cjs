const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('djAssistDesktop', {
  platform: process.platform,
  pickDirectory: () => ipcRenderer.invoke('desktop:pick-directory'),
  showItemInFolder: (targetPath) => ipcRenderer.invoke('desktop:show-item-in-folder', targetPath),
});
