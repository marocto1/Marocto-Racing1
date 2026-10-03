import {Geometry} from './geometry.js';
export const CAR_SPECS=[
  {name:'Touring GTR · E46 inspired',model:'m3gtr',class:'touring',color:[.16,.42,.85],length:4.55,width:1.84,height:1.39,wheelbase:2.73,mass:1400,power:9200,grip:1.12,drag:.45,roofFront:.55,roofRear:-.92,wing:2,lights:'split'},
  {name:'Vector R · R34 inspired',model:'r34',class:'coupe',color:[.1,.62,.75],length:4.60,width:1.88,height:1.35,wheelbase:2.66,mass:1510,power:9700,grip:1.08,drag:.46,roofFront:.43,roofRear:-.8,wing:2,lights:'round'},
  {name:'Apex J · Mk4 inspired',model:'supra',class:'gt',color:[.9,.22,.08],length:4.52,width:1.93,height:1.28,wheelbase:2.55,mass:1480,power:10100,grip:1.01,drag:.43,roofFront:.2,roofRear:-1.13,wing:3,lights:'oval'},
  {name:'Rotary F · FD inspired',model:'rx7',class:'lightweight',color:[.96,.64,.08],length:4.29,width:1.80,height:1.19,wheelbase:2.45,mass:1220,power:8000,grip:1.05,drag:.40,roofFront:.04,roofRear:-.94,wing:1,lights:'pop'},
  {name:'Rally IX · Evo inspired',model:'evo8',class:'sedan',color:[.78,.81,.86],length:4.50,width:1.83,height:1.48,wheelbase:2.62,mass:1440,power:8900,grip:1.16,drag:.50,roofFront:.66,roofRear:-.9,wing:2,lights:'split'},
  {name:'RearSport GT · 911 inspired',model:'911turbo',class:'rearengine',color:[.83,.13,.22],length:4.43,width:1.94,height:1.27,wheelbase:2.46,mass:1380,power:9700,grip:1.20,drag:.39,roofFront:.64,roofRear:-1.32,wing:3,lights:'classic'}
];
const DARK=[.035,.045,.055],GLASS=[.09,.20,.26],CHROME=[.65,.72,.78],WHITE=[1,.94,.72],RED=[.93,.025,.035],AMBER=[1,.38,.04],SILVER=[.82,.86,.9];
function shade(c,v){return c.map(x=>Math.max(0,Math.min(1,x*v)));}
function lampDisc(g,x,y,z,r,color,segments=18){for(let i=0;i<segments;i++){const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;g.triangle([x,y,z],[x+Math.cos(a)*r,y+Math.sin(a)*r,z],[x+Math.cos(b)*r,y+Math.sin(b)*r,z],color);}}
function addM3GTR(g,s,half,w,c){
  // Twin kidney grille, deep GT splitter, hood extraction vents and the iconic white/blue race graphics.
  for(const side of [-1,1]){g.box(side*.115,.55,half+.052,.09,.115,.018,DARK);g.box(side*.115,.55,half+.073,.058,.075,.008,CHROME);}
  g.box(0,.31,half+.04,w*.91,.035,.17,DARK);g.box(0,.34,half+.15,w*.55,.02,.08,DARK);
  for(const side of [-1,1]){g.box(side*.35,.86,half-.63,.105,.012,.29,DARK,-side*.13);g.box(side*.62,.86,half-.68,.075,.012,.21,DARK,-side*.12);}
  g.box(0,.895,.43,.055,.012,.77,[.9,.93,.98]);
  for(const side of [-1,1]){g.box(side*w*.965,.69,.22,.022,.22,1.14,[.9,.93,.98]);g.box(side*w*.985,.48,-.78,.026,.075,.22,DARK);}
  g.box(0,.54,-half-.06,w*.74,.045,.05,DARK);g.box(0,.72,-half-.07,w*.58,.032,.018,RED);
}
function addR34(g,s,half,w,c){
  // Squared-off GT-R face, center intercooler, bonnet vent and four round rear lamps.
  g.box(0,.43,half+.06,w*.55,.105,.035,DARK);g.box(0,.43,half+.10,w*.36,.067,.014,[.25,.29,.32]);
  for(const side of [-1,1]){g.box(side*w*.68,.68,half+.04,w*.19,.075,.022,WHITE);g.box(side*w*.68,.60,half+.05,w*.17,.023,.025,AMBER);}
  g.box(0,.85,half-.72,.27,.014,.18,DARK);g.box(0,.84,half-.70,.16,.01,.25,shade(c,.65));
  for(const side of [-1,1])for(const xmul of [.43,.68])lampDisc(g,side*w*xmul,.68,-half-.055,.105,RED);
  g.box(0,.34,-half-.08,w*.77,.07,.07,DARK);
  // High two-pedestal wing.
  for(const side of [-1,1])g.box(side*w*.49,1.03,-half+.37,.035,.25,.045,DARK);
  g.box(0,1.27,-half+.36,w*.88,.042,.13,shade(c,.72));
}
function addSupra(g,s,half,w,c){
  // Rounded Mk4-style nose, split intake, projector lamps and tall curved-looking rear wing.
  g.box(0,.39,half+.09,w*.56,.09,.05,DARK);g.box(0,.31,half+.13,w*.82,.025,.10,DARK);
  for(const side of [-1,1]){
    g.box(side*w*.58,.69,half+.07,w*.22,.065,.025,[.94,.98,1]);
    lampDisc(g,side*w*.68,.70,half+.101,.07,WHITE,16);lampDisc(g,side*w*.49,.69,half+.102,.052,AMBER,16);
    lampDisc(g,side*w*.47,.66,-half-.055,.105,RED);lampDisc(g,side*w*.70,.66,-half-.055,.095,RED);
  }
  g.box(0,.87,half-.92,.19,.012,.23,shade(c,.74));
  for(const side of [-1,1])g.box(side*w*.56,1.01,-half+.43,.04,.30,.055,DARK,-side*.08);
  g.box(0,1.31,-half+.40,w*.90,.04,.14,shade(c,.75));
  g.box(0,.31,-half-.08,w*.78,.06,.08,DARK);
}
function addRX7(g,s,half,w,c){
  // Very low FD nose, pop-up lamp lids, smooth center intake and twin round rear lamps.
  g.box(0,.33,half+.095,w*.49,.075,.05,DARK);g.box(0,.26,half+.13,w*.74,.025,.11,DARK);
  for(const side of [-1,1]){g.box(side*w*.55,.73,half-.56,.20,.015,.25,shade(c,.82),-side*.08);g.box(side*w*.67,.54,half+.06,.13,.035,.026,AMBER);}
  for(const side of [-1,1]){lampDisc(g,side*w*.49,.61,-half-.045,.085,RED);lampDisc(g,side*w*.68,.61,-half-.045,.075,RED);}
  g.box(0,.61,-half-.055,w*.34,.028,.012,DARK);g.box(0,.29,-half-.08,w*.68,.045,.065,DARK);
  // Smaller single-plane wing.
  for(const side of [-1,1])g.box(side*w*.46,.95,-half+.34,.03,.16,.04,DARK);
  g.box(0,1.08,-half+.34,w*.72,.035,.10,shade(c,.68));
}
function addEvo(g,s,half,w,c){
  // Evo VIII rally face, large intercooler, bonnet vent, fog lamps and squared high wing.
  g.box(0,.42,half+.07,w*.57,.10,.045,DARK);g.box(0,.41,half+.11,w*.38,.067,.018,[.32,.35,.38]);
  for(const side of [-1,1]){g.box(side*w*.70,.65,half+.055,w*.18,.07,.025,WHITE);lampDisc(g,side*w*.72,.40,half+.092,.085,WHITE);g.box(side*w*.98,.77,-.42,.018,.018,.08,CHROME);}
  g.box(0,.93,half-.64,.28,.016,.22,DARK);g.box(0,.91,half-.62,.16,.012,.28,shade(c,.64));
  g.box(0,.31,half+.08,w*.88,.025,.12,DARK);g.box(0,.31,-half-.07,w*.76,.055,.07,DARK);
  for(const side of [-1,1])g.box(side*w*.50,1.07,-half+.37,.042,.29,.05,DARK);
  g.box(0,1.34,-half+.36,w*.91,.045,.15,shade(c,.62));
}
function add911(g,s,half,w,c){
  // 996-style round/teardrop front lamps, wide rear light bar, turbo intakes and rear-deck grille.
  for(const side of [-1,1]){lampDisc(g,side*w*.58,.73,half+.055,.145,WHITE,22);g.box(side*w*.83,.53,-.38,.025,.10,.26,DARK);}
  g.box(0,.33,half+.07,w*.64,.065,.075,DARK);g.box(0,.62,-half-.055,w*.76,.035,.018,RED);
  for(let i=0;i<7;i++)g.box((i-3)*.09,.84,-half+.46,.03,.012,.20,DARK);
  g.box(0,.30,-half-.09,w*.69,.055,.075,DARK);
  for(const side of [-1,1])g.box(side*w*.54,1.00,-half+.43,.037,.22,.05,DARK);
  g.box(0,1.20,-half+.42,w*.82,.038,.15,shade(c,.68));
}
function addSignatureDetails(g,spec,half,w,wz,c){
  switch(spec.model){
    case 'm3gtr':addM3GTR(g,spec,half,w,c);break;
    case 'r34':addR34(g,spec,half,w,c);break;
    case 'supra':addSupra(g,spec,half,w,c);break;
    case 'rx7':addRX7(g,spec,half,w,c);break;
    case 'evo8':addEvo(g,spec,half,w,c);break;
    case '911turbo':add911(g,spec,half,w,c);break;
  }
  // Undertray, brake cooling ducts and visible exhausts make all cars read as complete models from chase view.
  g.box(0,.245,0,w*.87,.025,half*.78,DARK);
  for(const side of [-1,1])g.box(side*w*.70,.37,half-.06,.12,.045,.08,DARK);
  const exhaustZ=-half-.12,exhaustX=spec.model==='m3gtr'?.58:spec.model==='911turbo'?.55:.47;
  for(const side of [-1,1])g.cylinder(side*exhaustX,.34,exhaustZ,.055,.14,CHROME,14);
}
function buildWheel(spec,r){
  const wheel=new Geometry(),segments=spec.model==='911turbo'?24:spec.model==='m3gtr'?22:20;
  wheel.cylinder(0,0,0,r,.27,[.022,.026,.032],segments);
  const rim=spec.model==='m3gtr'||spec.model==='r34'?SILVER:spec.model==='evo8'?[.18,.20,.22]:CHROME;
  for(const side of [-1,1]){
    wheel.cylinder(side*.139,0,0,.245,.018,rim,segments,true);
    wheel.cylinder(side*.152,0,0,.075,.021,[.16,.18,.21],14);
    // Bright brake disc and model-specific colored caliper block.
    wheel.cylinder(side*.148,0,0,.175,.008,[.34,.36,.38],18);
    const caliper=spec.model==='m3gtr'||spec.model==='911turbo'?[.92,.15,.06]:spec.model==='evo8'?[.78,.08,.05]:[.15,.18,.21];
    wheel.box(side*.162,.11,.03,.012,.065,.035,caliper);
  }
  return wheel;
}
export function buildCar(spec){
  const g=new Geometry(),half=spec.length/2,w=spec.width/2,wz=spec.wheelbase/2,r=.35,c=spec.color;
  // Rings include the wheel arch contour: lower side panels actually rise over each wheel.
  const stations=[-half,-half+.22,-wz-.45,-wz-.32,-wz,-wz+.32,-wz+.45,0,wz-.45,wz-.32,wz,wz+.32,wz+.45,half-.22,half].sort((a,b)=>a-b);
  const rings=stations.map(z=>{
    const end=Math.abs(z)/half,taper=1-.22*Math.pow(end,7),width=w*taper;
    const arch=Math.min(Math.abs(z-wz),Math.abs(z+wz));const low=arch<.45?.36+Math.sqrt(.45*.45-arch*arch):.31;
    const front=z>0,top=(spec.class==='rearengine'&&front?.70:.84)-.15*Math.pow(end,5);
    return [[-width*.88,low,z],[-width,low+.035,z],[-width,top-.13,z],[-width*.86,top,z],[width*.86,top,z],[width,top-.13,z],[width*.88,low+.035,z],[width*.88,low,z]];
  });g.loft(rings,c);
  // Sloped windshield, roof, rear screen and side glass: no rectangular cabin block.
  const front=spec.roofFront,rear=spec.roofRear,roof=spec.height,base=.82,roofW=w*.67;
  const cabin=[[[ -w*.82,base,rear-.38],[-roofW,roof-.10,rear],[roofW,roof-.10,rear],[w*.82,base,rear-.38]],
    [[-w*.80,base,front+.59],[-roofW,roof,front],[roofW,roof,front],[w*.80,base,front+.59]]];
  g.quad(cabin[0][1],cabin[1][1],cabin[1][2],cabin[0][2],shade(c,.92));
  g.quad(cabin[1][0],cabin[1][1],cabin[1][2],cabin[1][3],GLASS);
  g.quad(cabin[0][3],cabin[0][2],cabin[0][1],cabin[0][0],GLASS);
  for(const side of [-1,1]) {
    const xb=side*w*.817,xt=side*roofW;
    g.quad([xb,base+.04,rear-.30],[xt,roof-.13,rear+.05],[xt,roof-.03,front-.04],[side*w*.79,base+.04,front+.49],GLASS);
    const pillarZ=spec.class==='sedan'?-.27:-.48;
    g.box(side*w*.76,1.06,pillarZ,.032,(roof-base)/2,.032,DARK);
    g.box(side*w*.97,.54,0,.037,.045,.65,shade(c,.62));
    g.box(side*w*.995,.75,-.25,.026,.018,.09,CHROME);
    g.box(side*(w+.09),1.00,front+.36,.13,.065,.105,c);
    if(spec.class==='sedan')g.box(side*w*.997,.76,-.94,.026,.018,.09,CHROME);
    for(const z of [-wz,wz])for(let i=0;i<12;i++) {
      const a=i*Math.PI/12,b=(i+1)*Math.PI/12,x=side*(w+.012);
      g.quad([x,.35+Math.sin(a)*.46,z+Math.cos(a)*.46],[x,.35+Math.sin(a)*.50,z+Math.cos(a)*.50],[x,.35+Math.sin(b)*.50,z+Math.cos(b)*.50],[x,.35+Math.sin(b)*.46,z+Math.cos(b)*.46],shade(c,.68));
    }
  }
  // Shared body-kit foundation. Signature details below override the visual identity per car.
  g.box(0,.45,half-.02,w*.79,.105,.06,shade(c,.65));g.box(0,.48,half+.045,w*.34,.07,.014,DARK);
  g.box(0,.29,half-.02,w*.94,.035,.14,DARK);g.box(0,.42,-half-.025,w*.9,.11,.045,shade(c,.7));
  g.box(0,.3,-half-.05,w*.72,.04,.10,DARK);
  for(const side of [-1,1]){
    g.box(side*.42,.78,half-.68,.12,.015,.19,DARK);
    if(spec.lights==='classic')g.cylinder(side*w*.62,.76,half-.17,.15,.045,WHITE,20);
    else {const y=spec.lights==='pop'?.77:.67;g.box(side*w*.62,y,half+.007,w*.21,.047,.025,WHITE);if(spec.lights==='split')g.box(side*w*.46,y,half+.032,.018,.06,.008,DARK);}
    if(spec.lights==='round'||spec.lights==='oval'){
      for(let k=0;k<2;k++){const x=side*(w*.49+k*.22);lampDisc(g,x,.66,-half-.015,.095,RED,16);}
    }else g.box(side*w*.61,.67,-half-.028,w*.24,.045,.012,RED);
    g.box(side*.59,.32,-half-.14,.075,.052,.18,CHROME);
  }
  g.box(0,.52,-half-.08,.18,.07,.008,[.8,.82,.83]);
  // Base spoiler only for models without their own signature wing replacement.
  if(spec.wing&&spec.model==='m3gtr'){const z=-half+.36,h=1.12;for(const side of [-1,1])g.box(side*w*.57,(h+.78)/2,z,.045,(h-.78)/2,.055,DARK);g.box(0,h,z,w*1.05,.04,.16,DARK);}
  addSignatureDetails(g,spec,half,w,wz,c);
  return {body:g,wheel:buildWheel(spec,r),wheelRadius:r,wheelX:w+.015,wheelZ:wz,modelId:spec.model};
}
