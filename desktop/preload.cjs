const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('racingDesktop',Object.freeze({platform:'windows-pc',onlineServer:process.env.MAROCTO_ONLINE_URL||'wss://marocto-racing-online.onrender.com/ws',toggleFullscreen:()=>ipcRenderer.invoke('racing:fullscreen'),quit:()=>ipcRenderer.send('racing:quit')}));
