import {Geometry} from './geometry.js';
export const CONTROL_POINTS=[[-160,-100],[-160,0],[-160,135],[-100,200],[15,215],[120,190],[165,130],[155,65],[100,45],[45,65],[15,35],[40,-10],[125,-20],[180,-65],[165,-135],[90,-180],[20,-160],[-25,-125],[-85,-150],[-140,-145]];
export const SURFACES={asphalt:{grip:1.10,rolling:.014,color:[.19,.21,.23]},curb:{grip:.90,rolling:.025},grass:{grip:.48,rolling:.10},snow:{grip:.27,rolling:.065}};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class Track {
  constructor(){
    this.halfWidth=8;this.barrierOffset=14;this.samples=[];this.length=0;
    const pts=CONTROL_POINTS,n=pts.length;
    for(let i=0;i<n;i++){
      const a=pts[(i+n-1)%n],b=pts[i],c=pts[(i+1)%n],d=pts[(i+2)%n],steps=Math.ceil(Math.hypot(c[0]-b[0],c[1]-b[1])/2.3);
      for(let j=0;j<steps;j++){const t=j/steps,t2=t*t,t3=t2*t;
        const calc=k=>.5*(2*b[k]+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t2+(-a[k]+3*b[k]-3*c[k]+d[k])*t3);
        this.samples.push({x:calc(0),z:calc(1),s:0});
      }
    }
    for(let i=0;i<this.samples.length;i++){
      const a=this.samples[i],b=this.samples[(i+1)%this.samples.length],l=Math.hypot(b.x-a.x,b.z-a.z);a.s=this.length;a.length=l;a.tx=(b.x-a.x)/l;a.tz=(b.z-a.z)/l;a.nx=a.tz;a.nz=-a.tx;this.length+=l;
    }
    this.gates=[];const out={};for(let i=0;i<24;i++){this.at(i*this.length/24,0,out);this.gates.push({x:out.x,z:out.z,tx:out.tx,tz:out.tz,nx:out.nx,nz:out.nz,s:i*this.length/24});}
  }
  at(distance,lateral,out){
    distance=((distance%this.length)+this.length)%this.length;
    let i=0;while(i<this.samples.length-1&&this.samples[i+1].s<=distance)i++;
    const a=this.samples[i],t=(distance-a.s)/a.length;
    out.x=a.x+a.tx*a.length*t+a.nx*lateral;out.z=a.z+a.tz*a.length*t+a.nz*lateral;out.tx=a.tx;out.tz=a.tz;out.nx=a.nx;out.nz=a.nz;out.index=i;return out;
  }
  query(x,z,out){
    let best=Infinity,idx=0,bestT=0;
    const n=this.samples.length,hint=out.index;
    // Local coherent search for normal driving; global recovery after a reset/teleport.
    // Two scalar passes avoid allocating a closure or temporary arrays per physics step.
    const local=Number.isInteger(hint);
    for(let pass=0;pass<(local?2:1);pass++){
      if(pass===1&&best<=28*28)break;
      const start=local&&pass===0?hint-14:0,count=local&&pass===0?29:n;
      for(let k=0;k<count;k++){
        const i=(start+k+n)%n,a=this.samples[i],t=clamp(((x-a.x)*a.tx+(z-a.z)*a.tz)/a.length,0,1);
        const dx=x-a.x-a.tx*a.length*t,dz=z-a.z-a.tz*a.length*t,d2=dx*dx+dz*dz;
        if(d2<best){best=d2;idx=i;bestT=t;}
      }
    }
    const a=this.samples[idx];out.index=idx;out.x=a.x+a.tx*a.length*bestT;out.z=a.z+a.tz*a.length*bestT;out.tx=a.tx;out.tz=a.tz;out.nx=a.nx;out.nz=a.nz;out.s=a.s+bestT*a.length;
    out.lateral=(x-out.x)*a.nx+(z-out.z)*a.nz;out.distance=Math.sqrt(best);
    const abs=Math.abs(out.lateral);out.surface=abs<this.halfWidth?'asphalt':abs<this.halfWidth+.8?'curb':out.x>85&&out.z<-75?'snow':'grass';return out;
  }
  createProgress(){return {next:1,completed:0,lastGate:0,lapTime:0,best:Infinity,checkpointTime:0};}
  updateProgress(car,dt){
    const p=car.progress;p.lapTime+=dt;p.checkpointTime+=dt;
    const g=this.gates[p.next],old=(car.prevX-g.x)*g.tx+(car.prevZ-g.z)*g.tz,now=(car.x-g.x)*g.tx+(car.z-g.z)*g.tz;
    const moveX=car.x-car.prevX,moveZ=car.z-car.prevZ,travel=Math.hypot(moveX,moveZ),forward=moveX*g.tx+moveZ*g.tz;
    // A checkpoint spans the complete legal corridor between the barriers, not only the asphalt.
    // This prevents a valid lap from getting permanently stuck after crossing a gate on a curb/shoulder.
    if(old<=0&&now>0&&forward>0){
      const t=-old/(now-old),x=car.prevX+moveX*t,z=car.prevZ+moveZ*t,lat=(x-g.x)*g.nx+(z-g.z)*g.nz;
      const vehicleHalf=car.spec?Math.max(.75,car.spec.width*.5):1,gateHalf=this.barrierOffset-vehicleHalf-.15;
      // Gates still have to be crossed forward, in order, without teleporting.
      if(Math.abs(lat)<=gateHalf&&travel<8){
        p.lastGate=p.next;p.checkpointTime=0;
        if(p.next===0){p.completed++;p.best=Math.min(p.best,p.lapTime);p.lapTime=0;}
        p.next=(p.next+1)%this.gates.length;return true;
      }
    }return false;
  }
  buildScene(){
    const ground=new Geometry();ground.box(0,-.19,0,540,.15,540,[.18,.30,.15]);
    ground.box(145,-.024,-135,70,.018,60,[.78,.83,.83]);
    const chunks=[];const n=this.samples.length;
    // One combined colored mesh per ~55m road chunk; no individual curb/barrier draw calls.
    for(let start=0;start<n;start+=24){const g=new Geometry();let cx=0,cz=0,count=0;
      for(let i=start;i<Math.min(n,start+24);i++){
        const a=this.samples[i],b=this.samples[(i+1)%n];cx+=a.x;cz+=a.z;count++;
        const strip=(left,right,y,color)=>g.quad([a.x+a.nx*left,y,a.z+a.nz*left],[b.x+b.nx*left,y,b.z+b.nz*left],[b.x+b.nx*right,y,b.z+b.nz*right],[a.x+a.nx*right,y,a.z+a.nz*right],color);
        strip(-8,8,0,[.19,.21,.23]);
        for(const side of [-1,1]){
          strip(side*7.55,side*7.7,.012,[.87,.89,.82]);strip(side*8,side*8.7,.023,i%4<2?[.85,.13,.11]:[.88,.9,.86]);
          strip(side*8.7,side*10,.004,[.39,.35,.26]);
          const x=(a.x+b.x)/2+(a.nx+b.nx)/2*side*14,z=(a.z+b.z)/2+(a.nz+b.nz)/2*side*14;
          g.box(x,.58,z,.18,.58,a.length/2+.035,i%10<5?[.67,.70,.72]:[.26,.32,.39],Math.atan2(a.tx,a.tz));
        }
        if(a.s<80&&i%6<3)strip(-.055,.055,.015,[.76,.78,.74]);
        if(a.s<30&&i%5===0){strip(-5,-2,.013,[.84,.85,.79]);strip(2,5,.013,[.84,.85,.79]);}
      }chunks.push({geometry:g,x:cx/count,z:cz/count,radius:65});
    }
    const finish=new Geometry(),a=this.samples[0];
    for(let x=-8;x<8;x++)for(let z=0;z<2;z++){
      const p=[a.x+a.nx*x+a.tx*z,.025,a.z+a.nz*x+a.tz*z],q=[p[0]+a.nx,.025,p[2]+a.nz],r=[q[0]+a.tx,.025,q[2]+a.tz],s=[p[0]+a.tx,.025,p[2]+a.tz];finish.quad(p,q,r,s,(x+z)%2?[.03,.03,.035]:[.97,.97,.91]);
    }
    for(const side of [-1,1])finish.box(a.x+a.nx*side*10,3.5,a.z+a.nz*side*10,.25,3.5,.25,[.35,.42,.48]);
    finish.box(a.x,6.8,a.z,10.4,.40,.3,[.08,.13,.2],Math.atan2(a.tx,a.tz));
    const env=new Geometry();
    // Pit complex along the main straight, with garages, windows, grandstand and gantries.
    env.box(-195,4,25,15,4,55,[.60,.62,.63]);env.box(-195,8.3,25,16,.3,56,[.16,.22,.28]);
    for(let z=-15;z<70;z+=12){env.box(-179.9,2,z,.04,1.8,4.3,[.12,.16,.20]);env.box(-179.8,6.1,z,.05,.9,4.4,[.12,.28,.38]);}
    for(let i=0;i<7;i++)env.box(-122+i*1.4,1+i*.45,105,1.5,.22,32,[.28,.35,.42]);
    for(let z=75;z<140;z+=4)env.box(-115,4.8,z,.35,.4,.55,z%8?[.66,.25,.16]:[.20,.42,.66]);
    // Deterministic trees and buildings outside the barrier; no random frame work.
    const out={};for(let i=0;i<130;i++){const x=-300+(i*73%610),z=-275+(i*137%570);out.index=undefined;this.query(x,z,out);if(out.distance<30||x<-175&&x>-218&&z>-40&&z<90)continue;
      env.box(x,1.4,z,.3,1.4,.3,[.25,.18,.11]);const crown=i%3===0?[.22,.32,.22]:[.12,.26,.16];
      const rings=[[[x-2,2,z-2],[x+2,2,z-2],[x+2,2,z+2],[x-2,2,z+2]],[[x-.06,7,z-.06],[x+.06,7,z-.06],[x+.06,7,z+.06],[x-.06,7,z+.06]]];env.loft(rings,crown);
    }
    for(let i=0;i<9;i++)env.box(-270+i*65,6+i%3*4,280,10,6+i%3*4,12,[.34,.40,.44]);
    return {ground,chunks,finish,environment:env};
  }
}
