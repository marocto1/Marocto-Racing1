const {app,BrowserWindow,protocol,net,ipcMain,Menu,dialog}=require('electron');
const path=require('node:path');const fs=require('node:fs');const {pathToFileURL}=require('node:url');
// Keep the portable build's settings beside the executable, not on the system drive.
// Development settings live inside the checkout. Both paths can be on D: or E:.
const base=process.env.PORTABLE_EXECUTABLE_DIR||(!app.isPackaged?path.resolve(__dirname,'..'):path.dirname(process.execPath));
const data=path.join(base,'Marocto-Racing-Data');
const externalModels=path.join(data,'Models');
try{fs.mkdirSync(data,{recursive:true});fs.mkdirSync(externalModels,{recursive:true});app.setPath('userData',data);app.setPath('sessionData',path.join(data,'session'));}catch(error){app.whenReady().then(()=>{dialog.showErrorBox('Marocto Racing','Put Marocto Racing in a writable folder on D: or E:.\n'+error.message);app.quit();});}
protocol.registerSchemesAsPrivileged([{scheme:'racing',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
if(process.env.RACING_CI==='1'){for(const [name,value] of [['use-gl','angle'],['use-angle','swiftshader'],['enable-unsafe-swiftshader',undefined],['ignore-gpu-blocklist',undefined]])app.commandLine.appendSwitch(name,value);}
let main;
app.whenReady().then(()=>{
 const root=path.join(app.getAppPath(),'www');
 protocol.handle('racing',request=>{
  const url=new URL(request.url);if(url.host!=='game'||request.method!=='GET')return new Response('Forbidden',{status:403});
  let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return new Response('Invalid path',{status:400});}
  const relative=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');
  // Personal PC builds may override only car assets from the writable data
  // folder. The rest of the app always comes from packaged www/.
  if(relative.startsWith('assets/mw2005/')){
    const overrideRoot=path.resolve(externalModels,'mw2005');
    const override=path.resolve(externalModels,relative.slice('assets/'.length));
    if(override.startsWith(overrideRoot+path.sep)&&fs.existsSync(override)&&fs.statSync(override).isFile())return net.fetch(pathToFileURL(override).href);
  }
  const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)&&file!==root)return new Response('Forbidden',{status:403});
  return net.fetch(pathToFileURL(file).href);
 });
 main=new BrowserWindow({width:1366,height:800,minWidth:960,minHeight:600,title:'Marocto Racing PC',backgroundColor:'#080e16',show:false,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 Menu.setApplicationMenu(null);main.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 main.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('racing://game/'))event.preventDefault();});
 main.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
 main.webContents.on('did-fail-load',(_event,code,description)=>{dialog.showErrorBox('Marocto Racing',`Game could not load (${code}): ${description}`);app.quit();});
 main.once('ready-to-show',()=>{if(process.env.RACING_CI!=='1')main.maximize();main.show();});
 const trusted=event=>event.sender===main.webContents&&event.senderFrame?.url.startsWith('racing://game/');
 ipcMain.handle('racing:fullscreen',event=>{if(!trusted(event))throw Error('Invalid game window');main.setFullScreen(!main.isFullScreen());return main.isFullScreen();});
 ipcMain.on('racing:quit',event=>{if(trusted(event))app.quit();});
 main.loadURL('racing://game/index.html?platform=pc'+(process.env.RACING_CI==='1'?'&debug=1':''));
});
app.on('window-all-closed',()=>app.quit());
