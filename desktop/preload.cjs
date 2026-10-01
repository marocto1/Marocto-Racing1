const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('racingDesktop',Object.freeze({platform:'windows-pc',toggleFullscreen:()=>ipcRenderer.invoke('racing:fullscreen'),quit:()=>ipcRenderer.send('racing:quit')}));
