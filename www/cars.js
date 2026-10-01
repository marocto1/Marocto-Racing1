import {Geometry} from './geometry.js';
export const CAR_SPECS=[
  {name:'Touring GTR · E46 inspired',class:'touring',color:[.16,.42,.85],length:4.55,width:1.84,height:1.39,wheelbase:2.73,mass:1400,power:9200,grip:1.12,drag:.45,roofFront:.55,roofRear:-.92,wing:2,lights:'split'},
  {name:'Vector R · R34 inspired',class:'coupe',color:[.1,.62,.75],length:4.60,width:1.88,height:1.35,wheelbase:2.66,mass:1510,power:9700,grip:1.08,drag:.46,roofFront:.43,roofRear:-.8,wing:2,lights:'round'},
  {name:'Apex J · Mk4 inspired',class:'gt',color:[.9,.22,.08],length:4.52,width:1.93,height:1.28,wheelbase:2.55,mass:1480,power:10100,grip:1.01,drag:.43,roofFront:.2,roofRear:-1.13,wing:3,lights:'oval'},
  {name:'Rotary F · FD inspired',class:'lightweight',color:[.96,.64,.08],length:4.29,width:1.80,height:1.19,wheelbase:2.45,mass:1220,power:8000,grip:1.05,drag:.40,roofFront:.04,roofRear:-.94,wing:1,lights:'pop'},
  {name:'Rally IX · Evo inspired',class:'sedan',color:[.78,.81,.86],length:4.50,width:1.83,height:1.48,wheelbase:2.62,mass:1440,power:8900,grip:1.16,drag:.50,roofFront:.66,roofRear:-.9,wing:2,lights:'split'},
  {name:'RearSport GT · 911 inspired',class:'rearengine',color:[.83,.13,.22],length:4.43,width:1.94,height:1.27,wheelbase:2.46,mass:1380,power:9700,grip:1.20,drag:.39,roofFront:.64,roofRear:-1.32,wing:3,lights:'classic'}
];
const DARK=[.035,.045,.055],GLASS=[.09,.20,.26],CHROME=[.65,.72,.78],WHITE=[1,.94,.72],RED=[.93,.025,.035];
function shade(c,v){return c.map(x=>x*v);}
export function buildCar(spec){
  const g=new Geometry(),half=spec.length/2,w=spec.width/2,wz=spec.wheelbase/2,r=.35,c=spec.color;
  // Rings include the wheel arch contour: lower side panels actually rise over each wheel.
  const stations=[-half,-half+.22,-wz-.45,-wz-.32,-wz,-wz+.32,-wz+.45,0,wz-.45,wz-.32,wz,wz+.32,wz+.45,half-.22,half].sort((a,b)=>a-b);
  const rings=stations.map(z=>{
    const end=Math.abs(z)/half,taper=1-.22*Math.pow(end,7),width=w*taper;
    const arch=Math.min(Math.abs(z-wz),Math.abs(z+wz));const low=arch<.45?.36+Math.sqrt(.45*.45-arch*arch):.31;
    const front=z>0,top=(spec.class==='rearengine'&&front?.70:.84)-.15*Math.pow(end,5);
    return [[-width*.88,low,z],[-width,low+.035,z],[-width,top-.13,z],[-width*.86,top,z],[width*.86,top,z],[width,top-.13,z],[width,low+.035,z],[width*.88,low,z]];
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
    // Window pillars, roof rails, door handles, side skirts and mirrors.
    const pillarZ=spec.class==='sedan'?-.27:-.48;
    g.box(side*w*.76,1.06,pillarZ,.032,(roof-base)/2,.032,DARK);
    g.box(side*w*.97,.54,0,.037,.045,.65,shade(c,.62));
    g.box(side*w*.995,.75,-.25,.026,.018,.09,CHROME);
    g.box(side*(w+.09),1.00,front+.36,.13,.065,.105,c);
    if(spec.class==='sedan')g.box(side*w*.997,.76,-.94,.026,.018,.09,CHROME);
    // Trim follows the top semicircle around each separate wheel.
    for(const z of [-wz,wz])for(let i=0;i<12;i++) {
      const a=i*Math.PI/12,b=(i+1)*Math.PI/12,x=side*(w+.012);
      g.quad([x,.35+Math.sin(a)*.46,z+Math.cos(a)*.46],[x,.35+Math.sin(a)*.50,z+Math.cos(a)*.50],[x,.35+Math.sin(b)*.50,z+Math.cos(b)*.50],[x,.35+Math.sin(b)*.46,z+Math.cos(b)*.46],shade(c,.68));
    }
  }
  // Sculpted bumper fascia, radiator opening, splitter and contrasting hood vents.
  g.box(0,.45,half-.02,w*.79,.105,.06,shade(c,.65));g.box(0,.48,half+.045,w*.34,.07,.014,DARK);
  g.box(0,.29,half-.02,w*.94,.035,.14,DARK);g.box(0,.42,-half-.025,w*.9,.11,.045,shade(c,.7));
  g.box(0,.3,-half-.05,w*.72,.04,.10,DARK);
  for(const side of [-1,1]){
    g.box(side*.42,.78,half-.68,.12,.015,.19,DARK);
    if(spec.lights==='classic')g.cylinder(side*w*.62,.76,half-.17,.15,.045,WHITE,20);
    else {const y=spec.lights==='pop'?.77:.67;g.box(side*w*.62,y,half+.007,w*.21,.047,.025,WHITE);if(spec.lights==='split')g.box(side*w*.46,y,half+.032,.018,.06,.008,DARK);}
    if(spec.lights==='round'||spec.lights==='oval'){
      for(let k=0;k<2;k++){const x=side*(w*.49+k*.22);for(let i=0;i<16;i++){const a=i*Math.PI/8,b=(i+1)*Math.PI/8;g.triangle([x,.66,-half-.015],[x+Math.cos(a)*.095,.66+Math.sin(a)*.085,-half-.015],[x+Math.cos(b)*.095,.66+Math.sin(b)*.085,-half-.015],RED);}}
    }else g.box(side*w*.61,.67,-half-.028,w*.24,.045,.012,RED);
    g.box(side*.59,.32,-half-.14,.075,.052,.18,CHROME);
  }
  g.box(0,.52,-half-.08,.18,.07,.008,[.8,.82,.83]);
  if(spec.wing){const z=-half+.36,h=spec.wing===3?1.27:1.08;
    for(const side of [-1,1])g.box(side*w*.57,(h+.78)/2,z,.045,(h-.78)/2,.055,DARK);
    g.box(0,h,z,w*(spec.wing===1?.78:1.06),.04,.16,spec.wing===1?c:DARK);
    for(const side of [-1,1])g.box(side*w*1.03,h+.01,z,.035,.11,.20,c);
  }
  if(spec.class==='touring')for(const side of [-1,1])g.box(side*.33,.845,.25,.09,.012,.67,[.83,.88,.96]);
  if(spec.class==='sedan')g.box(0,.86,.87,.22,.035,.22,DARK);
  const wheel=new Geometry();wheel.cylinder(0,0,0,r,.26,[.025,.03,.037],20);
  for(const side of [-1,1]){wheel.cylinder(side*.137,0,0,.235,.018,CHROME,18,true);wheel.cylinder(side*.151,0,0,.068,.02,[.19,.22,.26],12);}
  return {body:g,wheel,wheelRadius:r,wheelX:w+.015,wheelZ:wz};
}
