import {platform} from './platform.js';
import {Geometry} from './geometry.js';
import {Engine,ChaseCamera,modelMatrix} from './engine.js';
import {CAR_SPECS,buildCar} from './cars.js';
import {loadImportedCarSet} from './imported-car-models.js';
import {Track} from './track.js';
import {createVehicle,stepVehicle,collideBarrier,collideCars,resetVehicle,FIXED_DT,PHYSICS_PROFILE} from './physics-mw2005-drivetrain.js';
import {InputManager} from './input.js';
import {createAIController,AI_LEVELS} from './ai.js';
import {initUI,strings} from './ui.js';
import {initOnlineUI} from './online-ui.js';
export const cars=CAR_SPECS.map(s=>[s.name,0,s.color]);
const canvas=document.querySelector('#gl'),track=new Track(),input=new InputManager(),ai=createAIController(track);
const pick=[0,1],cameras=[new ChaseCamera(),new ChaseCamera()],previewCamera=new ChaseCamera(5.8,0,2.8,.85);
const hud=[document.querySelector('#h0'),document.querySelector('#h1')],countdownEl=document.querySelector('#countdown');
let E,models,world,S=[],running=false,mode='menu',last=0,accumulator=0,lapGoal=3,countdown=0,hudTime=0,winner=-1,previewPlayer=0,aiLevel=1;
const previewTarget={x:0,z:0,a:-.80,vx:0,vz:0};
const previewCar={x:0,z:0,a:0,vx:0,vz:0,steerAngle:.18,wheelSpin:0,roll:0,pitch:0,boost:false},mapCanvas=document.querySelector('#minimap'),map=mapCanvas.getContext('2d');
const mapPath=new Path2D();for(let i=0;i<track.samples.length;i++){const a=track.samples[i],x=(a.x+210)*.32,z=(a.z+210)*.23;if(i===0)mapPath.moveTo(x,z);else mapPath.lineTo(x,z);}mapPath.closePath();
const MR=window.MR={
  pick,cars,aiLevels:AI_LEVELS,
  setAILevel(value){aiLevel=Math.max(0,Math.min(AI_LEVELS.length-1,Number(value)||0));},
  getAILevel(){return aiLevel;},
  start(laps){
    if(!E)return;lapGoal=Math.max(1,Math.min(5,Number(laps)||3));S=[createVehicle(CAR_SPECS[pick[0]],0,track),createVehicle(CAR_SPECS[pick[1]],1,track)];
    cameras[0].reset(S[0]);cameras[1].reset(S[1]);ai.reset(S[1]);winner=-1;countdown=3;accumulator=0;last=0;running=true;mode='race';input.setEnabled(true);
    document.querySelector('#race').appendChild(canvas);document.querySelector('#race').classList.add('on');document.querySelector('#menu').classList.remove('on');document.querySelector('#finish').classList.remove('show');document.querySelector('#pause').classList.remove('show');countdownEl.textContent='3';hudTime=1;
  },
  pause(){pause();},
  stop(){running=false;mode='menu';input.setEnabled(false);document.querySelector('#race').classList.remove('on');document.querySelector('#menu').classList.add('on');document.querySelector('#finish').classList.remove('show');countdownEl.textContent='';},
  preview(p){if(!E)return;previewPlayer=p;mode='preview';previewCar.a=.40;previewCamera.initialized=false;document.querySelector('#garage-preview').appendChild(canvas);},
  closePreview(){if(mode==='preview')mode='menu';},
  resume(){if(mode==='race'&&winner<0){running=true;last=0;input.setEnabled(true);document.querySelector('#pause').classList.remove('show');}},
  getDiagnostics(){return {version:'1.4.0-mw-drivetrain-phase7-model-pipeline',physics:PHYSICS_PROFILE,models:models?.map(m=>m.source)||[],platform:platform.pc?'pc':'touch',layout:'single',mode,running,countdown,winner,aiLevel:AI_LEVELS[aiLevel].id,trackLength:track.length,checkpoints:track.gates.length,quality:E?.quality,drawCalls:E?.drawCalls,triangles:E?.triangles,frameMs:E?.frameEMA,vehicles:S.map(s=>({p:s.p,x:s.x,z:s.z,a:s.a,vx:s.vx,vz:s.vz,steer:s.steerAngle,wheelSpin:s.wheelSpin,surface:s.surface,n:s.n,gear:s.gear,rpm:s.rpm,slipAngle:s.slipAngle,drift:s.driftValue,traction:s.traction,driveLayout:s.driveLayout,mwSource:s.mwSource,wheelModel:s.wheelModel,assistModel:s.assistModel,drivetrainModel:s.drivetrainModel,assists:s.phase6?{tcs:s.phase6.tcsActive,abs:s.phase6.absActive,esc:s.phase6.escActive,drivenSlip:s.phase6.drivenSlip,targetYaw:s.phase6.targetYaw,slipAngle:s.phase6.slipAngle,inputThrottle:s.phase6.inputThrottle,outputThrottle:s.phase6.outputThrottle,inputBrake:s.phase6.inputBrake,outputBrake:s.phase6.outputBrake}:null,drivetrain:s.phase7?{clutch:s.phase7.clutch,clutchTarget:s.phase7.clutchTarget,shiftCut:s.phase7.shiftCut,shiftEvents:s.phase7.shiftEvents,launch:s.phase7.launchActive,burnout:s.phase7.burnoutActive,wheelspin:s.phase7.wheelspin,drivenSlip:s.phase7.drivenSlip,engineRPM:s.phase7.engineRPM,engineBrake:s.phase7.engineBrake,diffFront:s.phase7.diffFront,diffRear:s.phase7.diffRear,diffCenter:s.phase7.diffCenter,torqueCut:s.phase7.torqueCut}:null,suspension:s.suspension?{model:s.suspension.model,heave:s.suspension.heave,roll:s.suspension.roll,pitch:s.suspension.pitch,wheelsOnGround:s.suspension.wheelsOnGround,maxTravelUse:s.suspension.maxTravelUse,bottomOuts:s.suspension.bottomOuts}:null,wheels:s.wheels?.map(w=>({name:w.name,steer:w.steer,load:w.load,omega:w.omega,slipSpeed:w.slipSpeed,slipAngle:w.slipAngle,traction:w.traction,brakeLocked:w.brakeLocked,driveTorque:w.driveTorque,brakeTorque:w.brakeTorque,surface:w.surface,compression:w.suspensionCompression,travel:w.travel,springForce:w.suspensionSpringForce,damperForce:w.suspensionDamperForce,swayForce:w.swayForce,bottomed:w.bottomed,airborne:w.airborne})),lap:s.progress.completed,next:s.progress.next,collisions:s.collisionCount})),cameras:cameras.map(c=>({x:c.x,z:c.z,dx:c.dx,dz:c.dz}))};}
};
if(new URLSearchParams(location.search).has('debug'))MR.debug={track,input,get states(){return S;},get engine(){return E;},get models(){return models;},advance(seconds){for(let t=0;t<seconds;t+=FIXED_DT)simulate(FIXED_DT);},skipCountdown(){countdown=0;countdownEl.textContent='';}};
function drawParts(parts,vp){for(const mesh of parts)E.drawImported(mesh,vp,E.model);}
function drawVehicle(vp,s,index){
  const model=models[index],bodyY=.01+(s.bodyHeave||0);modelMatrix(E.model,s.x,bodyY,s.z,s.a,s.roll,s.pitch);
  if(model.imported)drawParts(model.bodySections,vp);else E.draw(model.body,vp,E.model);
  const sin=Math.sin(s.a),cos=Math.cos(s.a);
  for(let side=-1;side<=1;side+=2)for(let axle=-1;axle<=1;axle+=2){
    const x=side*model.wheelX,z=axle*model.wheelZ,wi=axle===1?(side<0?0:1):(side<0?2:3),wheel=s.wheels?.[wi];
    const steer=wheel?.steer??(axle===1?s.steerAngle:0),spin=wheel?.spin??s.wheelSpin,wheelY=.36+(wheel?.visualY||0);
    modelMatrix(E.model,s.x+x*cos+z*sin,wheelY,s.z-x*sin+z*cos,s.a+steer,0,spin);
    if(model.imported&&model.wheelSections?.length)drawParts(model.wheelSections,vp);else E.draw(model.wheel,vp,E.model);
  }
  if(s.boost){modelMatrix(E.model,s.x-sin*(s.spec.length*.5+.35),.34+bodyY,s.z-cos*(s.spec.length*.5+.35),s.a);E.draw(world.flame,vp,E.model);}
}
function renderScene(vp,car){
  E.draw(world.ground,vp);E.draw(world.finish,vp);
  for(let i=0;i<world.chunks.length;i++){const c=world.chunks[i],dx=c.x-car.x,dz=c.z-car.z;if(dx*dx+dz*dz<285*285)E.draw(c.mesh,vp);}
  E.draw(world.environment,vp);for(let p=0;p<2;p++)drawVehicle(vp,S[p],pick[p]);
}
function finish(p){winner=p;running=false;input.setEnabled(false);document.querySelector('#win').textContent=p===0?strings().youwin:strings().aiwin;document.querySelector('#finish').classList.add('show');}
function simulate(dt){
  if(!running||winner>=0)return;const controls=input.sample();
  if(countdown>0){countdown=Math.max(0,countdown-dt);const v=countdown>0?Math.ceil(countdown).toString():'';if(countdownEl.textContent!==v)countdownEl.textContent=v;return;}
  controls[1]=ai.sample(S[1],S[0],aiLevel,dt);
  for(let p=0;p<2;p++){if(controls[p].reset)resetVehicle(S[p],track);stepVehicle(S[p],controls[p],track,dt);collideBarrier(S[p],track);}
  if(collideCars(S[0],S[1]))for(let p=0;p<2;p++)collideBarrier(S[p],track);
  for(let p=0;p<2;p++){track.updateProgress(S[p],dt);if(S[p].progress.completed>=lapGoal&&winner<0)finish(p);}
}
function updateHUD(){
  const text=strings(),level=AI_LEVELS[aiLevel].name;
  for(let p=0;p<2;p++){const s=S[p],pr=s.progress,label=p===0?'YOU':`AI ${level}`,gear=s.gear<0?'R':s.gear,d=s.phase7;
    const driveInfo=d?` · CL ${Math.round(d.clutch*100)}%${d.launchActive?' · LC':''}${d.burnoutActive?' · BURN':''}`:'';
    hud[p].textContent=`${label}  ${Math.round(Math.hypot(s.vx,s.vz)*3.6)} ${text.kmh}  ·  G${gear} ${Math.round(s.rpm||0)} RPM${driveInfo}  ·  ${text.lap} ${Math.min(pr.completed+1,lapGoal)}/${lapGoal}  ·  CP ${pr.next||24}/24  ·  N₂O ${Math.ceil(s.n)}%`;
    const locked=s.wheels?.filter(w=>w.brakeLocked).length||0,air=s.wheels?.filter(w=>w.airborne).length||0,a=s.phase6;
    const assists=a?`${a.tcsActive?' · TCS':''}${a.absActive?' · ABS':''}${a.escActive?' · ESC':''}`:'';
    const drivetrain=d?`${d.wheelspin>.25?' · WHEELSPIN':''}${d.shiftCut>0?' · SHIFT':''}`:'';
    document.querySelector('#status'+p).textContent=`${text[s.surface]} · ${(s.driftValue||0)>.15||s.handbrake?text.drift:(s.longitudinal<-.5?text.reverse:text.drive)} · ${s.driveLayout||''}${locked?` · LOCK ${locked}`:''}${air?` · AIR ${air}`:''}${assists}${drivetrain}`;
  }
  map.clearRect(0,0,150,110);map.lineWidth=6;map.strokeStyle='#a3acb6';map.stroke(mapPath);map.lineWidth=3;map.strokeStyle='#28353a';map.stroke(mapPath);
  for(let p=0;p<2;p++){const s=S[p],gate=track.gates[s.progress.next];map.fillStyle=p===0?'#53a8ff':'#ffac54';map.beginPath();map.arc((s.x+210)*.32,(s.z+210)*.23,3,0,Math.PI*2);map.fill();map.fillRect((gate.x+210)*.32-1,(gate.z+210)*.23-1,3,3);}
}
function frame(t){
  requestAnimationFrame(frame);const frameMs=last?t-last:16,dt=Math.min(.1,frameMs/1000);last=t;if(!E||mode==='menu'||document.hidden)return;
  if(mode==='race'&&running){accumulator+=dt;let steps=0;while(accumulator>=FIXED_DT&&steps<12){simulate(FIXED_DT);accumulator-=FIXED_DT;steps++;}}
  E.adapt(frameMs,dt);E.clear(mode==='preview');const w=canvas.width,h=canvas.height;
  if(mode==='preview'){
    previewCar.a+=dt*.12;const vp=previewCamera.update(previewTarget,dt,w/h);E.viewport(0,0,w,h,previewCamera.ex,previewCamera.ez);E.draw(world.studio,vp);drawVehicle(vp,previewCar,pick[previewPlayer]);
  }else if(S.length===2){
    const vp=cameras[0].update(S[0],dt,w/h);E.viewport(0,0,w,h,cameras[0].ex,cameras[0].ez);renderScene(vp,S[0]);
    hudTime+=dt;if(hudTime>.10){hudTime=0;updateHUD();}
  }E.gl.disable(E.gl.SCISSOR_TEST);
}
function pause(){if(mode==='race'&&running){running=false;input.setEnabled(false);document.querySelector('#pause').classList.add('show');}}
window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();document.querySelector('#error').textContent=strings().contextLost;document.querySelector('#error').hidden=false;});
canvas.addEventListener('webglcontextrestored',()=>location.reload());
async function prepareModels(){
  const imported=await loadImportedCarSet(CAR_SPECS),out=[];
  for(let i=0;i<CAR_SPECS.length;i++){
    const spec=CAR_SPECS[i],fallback=buildCar(spec),raw=imported[i];
    if(raw?.body?.length){
      const bodySections=await Promise.all(raw.body.map(s=>E.prepareImportedMesh(s))),wheelSections=raw.wheel?.length?await Promise.all(raw.wheel.map(s=>E.prepareImportedMesh(s))):null;
      out.push({imported:true,source:`${raw.source}:${raw.id}`,bodySections,wheelSections,wheel:E.mesh(fallback.wheel),wheelX:raw.wheelX,wheelZ:raw.wheelZ});
    }else out.push({imported:false,source:'procedural-fallback',body:E.mesh(fallback.body),wheel:E.mesh(fallback.wheel),wheelX:fallback.wheelX,wheelZ:fallback.wheelZ});
  }
  return out;
}
async function boot(){
  try{
    E=new Engine(canvas);models=await prepareModels();
    const scene=track.buildScene();world={ground:E.mesh(scene.ground),finish:E.mesh(scene.finish),environment:E.mesh(scene.environment),chunks:scene.chunks.map(c=>({mesh:E.mesh(c.geometry),x:c.x,z:c.z}))};
    const studio=new Geometry();studio.box(0,-.14,0,40,.10,40,[.25,.31,.38]);studio.box(0,-.005,0,3.4,.035,3.4,[.30,.37,.44]);world.studio=E.mesh(studio);
    const f=new Geometry();f.box(-.53,0,0,.06,.06,.3,[.15,.65,1]);f.box(.53,0,0,.06,.06,.3,[.15,.65,1]);world.flame=E.mesh(f);
    initUI(MR);initOnlineUI();document.querySelector('#start').disabled=false;requestAnimationFrame(frame);
  }catch(error){console.error(error);document.querySelector('#error').textContent=`WebGL2: ${error.message}`;document.querySelector('#error').hidden=false;}
}
boot();
