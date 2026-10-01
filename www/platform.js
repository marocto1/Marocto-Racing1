// Shared game, with explicit input/display choices rather than a separate PC simulation.
let controlMode='auto',splitMode='auto';
const read=k=>{try{return localStorage.getItem(k);}catch{return null;}};
controlMode=['auto','keyboard','touch'].includes(read('mr-controls'))?read('mr-controls'):'auto';
splitMode=['auto','vertical','horizontal'].includes(read('mr-split'))?read('mr-split'):'auto';
const nativePC=Boolean(window.racingDesktop),forced=new URLSearchParams(location.search).get('platform');
const desktopQuery=window.matchMedia('(pointer: fine) and (min-width: 900px)');
let pc=false,vertical=false;
function apply(){
 pc=forced==='pc'||nativePC||(forced!=='touch'&&desktopQuery.matches);
 const keyboard=controlMode==='keyboard'||controlMode==='auto'&&pc;
 vertical=splitMode==='vertical'||splitMode==='auto'&&pc&&window.innerWidth>=900;
 document.body.dataset.platform=pc?'pc':'touch';document.body.dataset.controls=keyboard?'keyboard':'touch';document.body.dataset.layout=vertical?'vertical':'horizontal';
}
apply();window.addEventListener('resize',apply);desktopQuery.addEventListener('change',apply);
export const platform={get pc(){return pc;},get vertical(){return vertical;},get controls(){return controlMode;},get split(){return splitMode;},setControls(value){controlMode=['auto','keyboard','touch'].includes(value)?value:'auto';try{localStorage.setItem('mr-controls',controlMode);}catch{}apply();},setSplit(value){splitMode=['auto','vertical','horizontal'].includes(value)?value:'auto';try{localStorage.setItem('mr-split',splitMode);}catch{}apply();}};
