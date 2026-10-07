import {onlineClient as client} from './online.js';
const $=id=>document.getElementById(id);
const COPY={
ru:{online:'ОНЛАЙН',connecting:'ПОДКЛЮЧЕНИЕ…',waking:'ЗАПУСК СЕРВЕРА…',retrying:'ПОВТОРНОЕ ПОДКЛЮЧЕНИЕ…',offline:'НЕТ СВЯЗИ',guest:'ЗАЙТИ КАК GUEST',register:'РЕГИСТРАЦИЯ',login:'ВОЙТИ',logout:'ВЫЙТИ',username:'НИК / USERNAME',password:'ПАРОЛЬ',create:'СОЗДАТЬ КОМНАТУ',find:'FIND ROOM',room:'НАЗВАНИЕ КОМНАТЫ',roompass:'ПАРОЛЬ КОМНАТЫ (НЕОБЯЗАТЕЛЬНО)',players:'ИГРОКОВ',mode:'РЕЖИМ',laps:'КРУГИ',back:'НАЗАД',leave:'ВЫЙТИ ИЗ КОМНАТЫ',ready:'ГОТОВ',notready:'НЕ ГОТОВ',start:'СТАРТ',search:'ПОИСК КОМНАТЫ',empty:'КОМНАТ ПОКА НЕТ',server:'СЕРВЕР',reconnect:'ПЕРЕПОДКЛЮЧИТЬ',racepending:'Сетевая гонка запущена.'},
en:{online:'ONLINE',connecting:'CONNECTING…',waking:'STARTING SERVER…',retrying:'RECONNECTING…',offline:'OFFLINE',guest:'CONTINUE AS GUEST',register:'REGISTER',login:'LOGIN',logout:'LOG OUT',username:'NICKNAME / USERNAME',password:'PASSWORD',create:'CREATE ROOM',find:'FIND ROOM',room:'ROOM NAME',roompass:'ROOM PASSWORD (OPTIONAL)',players:'PLAYERS',mode:'MODE',laps:'LAPS',back:'BACK',leave:'LEAVE ROOM',ready:'READY',notready:'NOT READY',start:'START',search:'SEARCH ROOM',empty:'NO ROOMS YET',server:'SERVER',reconnect:'RECONNECT',racepending:'Online race started.'},
uz:{online:'ONLINE',connecting:'ULANMOQDA…',waking:'SERVER ISHGA TUSHMOQDA…',retrying:'QAYTA ULANMOQDA…',offline:'ALOQA YO‘Q',guest:'GUEST SIFATIDA KIRISH',register:'RO‘YXATDAN O‘TISH',login:'KIRISH',logout:'CHIQISH',username:'NIK / USERNAME',password:'PAROL',create:'XONA YARATISH',find:'XONANI TOPISH',room:'XONA NOMI',roompass:'XONA PAROLI (IXTIYORIY)',players:'O‘YINCHILAR',mode:'REJIM',laps:'AYLANALAR',back:'ORTGA',leave:'XONADAN CHIQISH',ready:'TAYYOR',notready:'TAYYOR EMAS',start:'START',search:'XONANI QIDIRISH',empty:'HOZIRCHA XONA YO‘Q',server:'SERVER',reconnect:'QAYTA ULANISH',racepending:'Onlayn poyga boshlandi.'}
};
const MODE_NAMES={CIRCUIT:'Circuit',SPRINT:'Sprint',DRAG:'Drag',LAP_KNOCKOUT:'Lap Knockout',SPEEDTRAP:'Speedtrap',TOLLBOOTH:'Tollbooth'};
let rooms=[],profile=null,room=null,ready=false,opened=false;
function t(){return COPY[document.documentElement.lang]||COPY.ru;}
function show(id){for(const p of ['onlineAuth','onlineBrowser','onlineLobby'])$(p).hidden=p!==id;}
function status(text,bad=false){$('onlineStatus').textContent=text;$('onlineStatus').classList.toggle('bad',bad);}
function error(code){$('onlineError').hidden=!code;$('onlineError').textContent=code?String(code).replaceAll('_',' '):'';}
function applyCopy(){
 const c=t(),map={onlineTitle:'online',onlineGuest:'guest',onlineRegister:'register',onlineLogin:'login',onlineLogout:'logout',onlineCreate:'create',onlineFindTitle:'find',onlineBack:'back',onlineLeave:'leave',onlineReady:'ready',onlineStart:'start',onlineReconnect:'reconnect'};
 for(const id in map)if($(id))$(id).textContent=c[map[id]];
 $('onlineUser').placeholder=c.username;$('onlinePassword').placeholder=c.password;$('roomName').placeholder=c.room;$('roomPassword').placeholder=c.roompass;$('roomSearch').placeholder=c.search;
 $('onlineServerLabel').textContent=c.server;$('roomMaxLabel').textContent=c.players;$('roomModeLabel').textContent=c.mode;$('roomLapsLabel').textContent=c.laps;renderRooms();renderLobby();
}
function renderRooms(){
 const list=$('roomList');if(!list)return;list.replaceChildren();const q=$('roomSearch').value.trim().toLocaleLowerCase();const filtered=rooms.filter(r=>!q||r.name.toLocaleLowerCase().includes(q));
 if(!filtered.length){const p=document.createElement('p');p.className='sub';p.textContent=t().empty;list.appendChild(p);return;}
 for(const r of filtered){const row=document.createElement('button');row.className='roomcard';const left=document.createElement('span');const title=document.createElement('b'),meta=document.createElement('small');title.textContent=r.name;meta.textContent=(MODE_NAMES[r.mode]||r.mode)+' · '+r.playerCount+'/'+r.maxPlayers+(r.locked?' · 🔒':'');left.append(title,meta);const join=document.createElement('span');join.textContent='JOIN ›';row.append(left,join);row.onclick=()=>{let password='';if(r.locked)password=prompt(t().roompass)||'';client.joinRoom(r.id,password);};list.appendChild(row);}
}
function renderLobby(){
 if(!room||!profile)return;$('lobbyName').textContent=room.name;$('lobbyMeta').textContent=(MODE_NAMES[room.mode]||room.mode)+' · '+room.playerCount+'/'+room.maxPlayers+(room.locked?' · 🔒':'');
 const list=$('lobbyPlayers');list.replaceChildren();for(const p of room.players){const row=document.createElement('div');row.className='lobbyplayer';const name=document.createElement('b'),state=document.createElement('span');name.textContent=p.nickname+(p.id===room.hostId?' · HOST':'');state.textContent=p.id===room.hostId?'HOST':(p.ready?'READY':'…');row.append(name,state);list.appendChild(row);}
 const me=room.players.find(p=>p.id===profile.id);ready=Boolean(me?.ready);$('onlineReady').textContent=ready?t().notready:t().ready;const isHost=room.hostId===profile.id;$('onlineStart').hidden=!isHost;$('onlineStart').disabled=room.playerCount<2||room.players.some(p=>p.id!==room.hostId&&!p.ready);
}
async function connect(){error();status(t().connecting);try{client.setEndpoint($('onlineServer').value);await client.connect();status('ONLINE');}catch(e){status(t().offline,true);error(e.message);}}
function onAuth(msg){profile=msg.profile;show('onlineBrowser');$('onlineProfile').textContent=profile.nickname+(profile.registered?' · ACCOUNT':' · GUEST');client.refreshRooms();error();}
export function initOnlineUI(racing){
 $('onlineButton').onclick=async()=>{$('onlineOverlay').classList.add('open');opened=true;$('onlineServer').value=client.endpoint;applyCopy();if(!client.ws||client.ws.readyState!==WebSocket.OPEN)await connect();};
 $('onlineBack').onclick=()=>{$('onlineOverlay').classList.remove('open');opened=false;};$('onlineReconnect').onclick=()=>{client.close();setTimeout(connect,50);};
 $('onlineGuest').onclick=()=>client.guest($('onlineUser').value);$('onlineRegister').onclick=()=>client.register($('onlineUser').value,$('onlinePassword').value);$('onlineLogin').onclick=()=>client.login($('onlineUser').value,$('onlinePassword').value);$('onlineLogout').onclick=()=>client.logout();
 $('onlineCreate').onclick=()=>client.createRoom({name:$('roomName').value,password:$('roomPassword').value,maxPlayers:+$('roomMax').value,mode:$('roomMode').value,laps:+$('roomLaps').value,track:'ROCKPORT_CIRCUIT'});
 $('roomSearch').oninput=renderRooms;$('onlineLeave').onclick=()=>client.leaveRoom();$('onlineReady').onclick=()=>client.ready(!ready);$('onlineStart').onclick=()=>client.startRace();
 client.on('connection.state',msg=>status(msg.state==='waking'?t().waking:msg.state==='retrying'?t().retrying:t().connecting));client.on('open',()=>status('ONLINE'));client.on('close',()=>status(t().offline,true));client.on('auth.ok',onAuth);client.on('auth.loggedOut',()=>{profile=null;room=null;show('onlineAuth');});
 client.on('room.list',msg=>{rooms=msg.rooms||[];renderRooms();});client.on('room.state',msg=>{room=msg.room;show('onlineLobby');renderLobby();});client.on('room.left',()=>{room=null;show('onlineBrowser');client.refreshRooms();});
 client.on('race.start',msg=>{room=msg.room;renderLobby();$('onlineRaceNotice').hidden=false;$('onlineRaceNotice').textContent=t().racepending;$('onlineOverlay').classList.remove('open');opened=false;racing?.startOnline?.(msg.room,client,profile,msg.startAt);});client.on('race.state',msg=>racing?.receiveOnlineState?.(msg));client.on('latency',x=>{$('onlinePing').textContent=x.ms+' ms';});client.on('error',msg=>error(msg.code||msg.message));
 new MutationObserver(()=>{if(opened)applyCopy();}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});$('onlineServer').value=client.endpoint;show('onlineAuth');applyCopy();
}
