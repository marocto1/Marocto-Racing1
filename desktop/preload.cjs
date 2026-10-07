const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('racingDesktop',Object.freeze({platform:'windows-pc',onlineServer:process.env.MAROCTO_ONLINE_URL||'ws://127.0.0.1:8787/ws',toggleFullscreen:()=>ipcRenderer.invoke('racing:fullscreen'),quit:()=>ipcRenderer.send('racing:quit')}));
