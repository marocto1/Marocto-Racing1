/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Phase 5 suspension layer for Marocto Racing.
 *
 * Spring progression, compression/rebound damping, digressive valving,
 * travel, ride height and anti-roll-bar behaviour are adapted from the
 * public MPL-2.0 UndercoverMWPhysics SuspensionRacer implementation.
 * The base planar four-wheel tire/drivetrain solver remains Phase 4.
 *
 * Upstream reference:
 * https://github.com/gaycoderprincess/UndercoverMWPhysics
 */

import {
  createVehicle as createPhase4Vehicle,
  stepVehicle as stepPhase4Vehicle,
  collideBarrier,
  collideCars,
  resetVehicle as resetPhase4Vehicle,
  FIXED_DT
} from './physics-mw2005-wheel4.js';
import {SURFACES} from './track.js';

export {FIXED_DT,collideBarrier,collideCars};
export const PHYSICS_PROFILE='mw2005-four-wheel-suspension-phase5';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const INCH_TO_M=.0254;
const LBIN_TO_NM=175.126835;
const G=9.81;

function springForce(compression,stiffnessLbIn,progression){
  const k=Math.max(1,stiffnessLbIn*LBIN_TO_NM);
  return Math.max(0,(compression*k)*(compression*progression+1));
}
function staticCompression(load,stiffnessLbIn,progression){
  const k=Math.max(1,stiffnessLbIn*LBIN_TO_NM),p=Math.max(0,progression);
  if(p<1e-6)return load/k;
  return Math.max(0,(-1+Math.sqrt(1+4*p*load/k))/(2*p));
}
function digressiveVelocity(rise,valvingIn,digression){
  const valving=Math.max(1e-5,valvingIn*INCH_TO_M),exp=clamp(1-digression,.05,1),a=Math.abs(rise);
  if(a<=valving||exp>=.999)return rise;
  const d=valving*Math.pow(a/valving,exp);
  return Math.sign(rise)*d;
}
function damperForce(rise,chassis,axle,mass){
  const adjusted=digressiveVelocity(rise,chassis.shockValving[axle],chassis.shockDigression[axle]);
  const stiffness=(adjusted>0?chassis.shock[axle]:chassis.shockExt[axle])*LBIN_TO_NM;
  let damp=adjusted*stiffness;
  const blowout=(chassis.shockBlowout||6)*G*mass;
  if(damp>blowout)damp=0;
  return damp;
}
function roadHeight(surface,contact,x,z){
  const s=contact?.s||0;
  // The visible curb in Marocto Racing is lower than MW's full 3D road
  // collision geometry. Keep the recovered suspension response but feed it a
  // road-height signal matching our actual track mesh so it does not behave as
  // if every rumble strip were a large step.
  if(surface==='curb')return .019+.006*Math.sin(s*1.85)+.003*Math.sin(s*4.1);
  if(surface==='grass')return .006*Math.sin(x*.73+z*.31)+.004*Math.sin(z*.91-x*.27);
  if(surface==='snow')return .004*Math.sin(x*.31-z*.25)+.003*Math.sin((x+z)*.57);
  return .0012*Math.sin(x*.19+z*.13)+.0008*Math.sin(z*.47-x*.11);
}
function axisStep(pos,vel,target,omega,dt){
  const zeta=.86,acc=(target-pos)*omega*omega-2*zeta*omega*vel;
  vel+=acc*dt;pos+=vel*dt;return [pos,vel];
}
function wheelWorld(car,w){
  const s=Math.sin(car.a),c=Math.cos(car.a);
  return [car.x+c*w.x+s*w.z,car.z-s*w.x+c*w.z];
}
function buildSuspensionState(car){
  const ch=car.mw.chassis,weight=car.spec.mass*G,bias=ch.frontBias*.01;
  const front=weight*bias,rear=weight*(1-bias);
  const staticLoads=[front*.5,front*.5,rear*.5,rear*.5];
  let springTotal=0,shockTotal=0;
  for(const w of car.wheels){
    const axle=w.axle,travel=ch.travel[axle]*INCH_TO_M,ride=ch.rideHeight[axle]*INCH_TO_M;
    const rest=clamp(staticCompression(staticLoads[w.index],ch.springs[axle],ch.springProgression[axle]),.004,travel*.85);
    w.restCompression=rest;w.suspensionCompression=rest;w.prevSuspensionCompression=rest;w.suspensionVelocity=0;
    w.suspensionForce=staticLoads[w.index];w.suspensionSpringForce=staticLoads[w.index];w.suspensionDamperForce=0;w.swayForce=0;
    w.travel=travel;w.rideHeight=ride;w.roadHeight=0;w.bottomed=false;w.airborne=false;w.visualY=0;
    springTotal+=ch.springs[axle]*LBIN_TO_NM;shockTotal+=ch.shock[axle]*LBIN_TO_NM;
  }
  const natural=Math.sqrt(Math.max(1,springTotal/car.spec.mass));
  car.suspension={model:'mw-spring-shock-sway-phase5',heave:0,heaveVel:0,roll:0,rollVel:0,pitch:0,pitchVel:0,
    heaveTarget:0,rollTarget:0,pitchTarget:0,naturalFrequency:clamp(natural,7,20),dampingScale:shockTotal/Math.max(1,springTotal),
    wheelsOnGround:4,bottomOuts:0,maxTravelUse:0,roadMean:0};
  car.wheelModel='four-wheel-mw-suspension';
  return car;
}
function resetSuspensionState(car){
  const ch=car.mw.chassis,weight=car.spec.mass*G,bias=ch.frontBias*.01,front=weight*bias,rear=weight*(1-bias),loads=[front*.5,front*.5,rear*.5,rear*.5];
  for(const w of car.wheels){
    const rest=clamp(staticCompression(loads[w.index],ch.springs[w.axle],ch.springProgression[w.axle]),.004,ch.travel[w.axle]*INCH_TO_M*.85);
    w.restCompression=rest;w.suspensionCompression=w.prevSuspensionCompression=rest;w.suspensionVelocity=0;w.suspensionForce=loads[w.index];
    w.suspensionSpringForce=loads[w.index];w.suspensionDamperForce=0;w.swayForce=0;w.roadHeight=0;w.bottomed=false;w.airborne=false;w.visualY=0;
  }
  Object.assign(car.suspension,{heave:0,heaveVel:0,roll:0,rollVel:0,pitch:0,pitchVel:0,heaveTarget:0,rollTarget:0,pitchTarget:0,wheelsOnGround:4,maxTravelUse:0,roadMean:0});
}
function prepareSuspensionLoads(car,track,dt){
  const ch=car.mw.chassis,sus=car.suspension,mass=car.spec.mass,weight=mass*G,wb=car.spec.wheelbase,tw=Math.max(1.1,car.trackWidth);
  const roads=new Array(4),contacts=new Array(4);
  let roadMean=0;
  for(const w of car.wheels){
    const [x,z]=wheelWorld(car,w),q={index:w.contact?.index};track.query(x,z,q);contacts[w.index]=q;
    const h=roadHeight(q.surface,q,x,z);roads[w.index]=h;roadMean+=h;
  }
  roadMean*=.25;sus.roadMean=roadMean;
  const left=(roads[0]+roads[2])*.5,right=(roads[1]+roads[3])*.5,front=(roads[0]+roads[1])*.5,rear=(roads[2]+roads[3])*.5;
  // Phase 4 already performs longitudinal/lateral load transfer. These body
  // angles describe compliant suspension motion, not another full geometric
  // copy of the same load transfer. Limiting them to realistic road-car
  // ranges prevents a 1 g corner from consuming the entire 6.5-8 inch travel.
  sus.heaveTarget=clamp(-roadMean*.20+Math.abs(car.latAccel||0)*.00008,-.016,.022);
  sus.rollTarget=clamp(-(car.latAccel||0)/G*.024+(right-left)/tw*.42,-.060,.060);
  sus.pitchTarget=clamp((car.longAccel||0)/G*.021+(front-rear)/wb*.38,-.050,.050);
  const omega=sus.naturalFrequency;
  [sus.heave,sus.heaveVel]=axisStep(sus.heave,sus.heaveVel,sus.heaveTarget,omega*.68,dt);
  [sus.roll,sus.rollVel]=axisStep(sus.roll,sus.rollVel,sus.rollTarget,omega*.58,dt);
  [sus.pitch,sus.pitchVel]=axisStep(sus.pitch,sus.pitchVel,sus.pitchTarget,omega*.62,dt);
  sus.heave=clamp(sus.heave,-.025,.032);sus.roll=clamp(sus.roll,-.075,.075);sus.pitch=clamp(sus.pitch,-.065,.065);

  const raw=new Array(4),comp=new Array(4),rise=new Array(4),spring=new Array(4),damp=new Array(4);
  for(const w of car.wheels){
    // Roll/pitch are body angles, but Phase 4 already accounts for much of the
    // corresponding tire load transfer. Feed only the compliant portion into
    // spring travel to avoid double-counting the same acceleration twice.
    const bodyDown=sus.heave-sus.roll*w.x*.52+sus.pitch*w.z*.60;
    raw[w.index]=w.restCompression+roads[w.index]+bodyDown;
    comp[w.index]=clamp(raw[w.index],0,w.travel);
    rise[w.index]=(comp[w.index]-w.suspensionCompression)/Math.max(dt,1e-5);
    spring[w.index]=springForce(comp[w.index],ch.springs[w.axle],ch.springProgression[w.axle]);
    damp[w.index]=damperForce(rise[w.index],ch,w.axle,mass);
  }
  const sway=[0,0,0,0];
  sway[0]=(comp[0]-comp[1])*(ch.sway[0]*LBIN_TO_NM);sway[1]=-sway[0];
  sway[2]=(comp[2]-comp[3])*(ch.sway[1]*LBIN_TO_NM);sway[3]=-sway[2];
  let onGround=0,maxUse=0;
  for(const w of car.wheels){
    const i=w.index,over=Math.max(0,raw[i]-w.travel),bottom=over*(ch.springs[w.axle]*LBIN_TO_NM)*6;
    let force=Math.max(0,spring[i]+damp[i]+sway[i]+bottom);
    const maxForce=weight*.52;force=clamp(force,0,maxForce);
    w.prevSuspensionCompression=w.suspensionCompression;w.suspensionCompression=comp[i];w.suspensionVelocity=rise[i];
    w.suspensionSpringForce=spring[i];w.suspensionDamperForce=damp[i];w.swayForce=sway[i];w.suspensionForce=force;
    w.roadHeight=roads[i];w.bottomed=over>1e-4;if(w.bottomed)sus.bottomOuts++;
    w.airborne=raw[i]<=0;w.surface=contacts[i].surface;w.contact=contacts[i];if(!w.airborne)onGround++;
    maxUse=Math.max(maxUse,comp[i]/Math.max(.001,w.travel));
    // Blend the real spring/damper force with Phase 4's already-proven load
    // transfer instead of replacing it almost completely. Suspension still
    // changes grip, while the race remains controllable on the existing track.
    w.load=lerp(w.load,force,.70);
  }
  sus.wheelsOnGround=onGround;sus.maxTravelUse=maxUse;
}
function finishSuspensionFrame(car){
  const sus=car.suspension,phaseRoll=car.roll,phasePitch=car.pitch;
  car.bodyHeave=-sus.heave;
  car.roll=clamp(sus.roll+phaseRoll*.14,-.10,.10);
  car.pitch=clamp(sus.pitch+phasePitch*.14,-.085,.085);
  for(const w of car.wheels){
    // Phase 4 uses compression as a temporary load proxy; expose the real
    // suspension compression again after the tire solve.
    w.compression=w.suspensionCompression;
    w.visualY=w.roadHeight*.68+(w.suspensionCompression-w.restCompression)*.36-sus.heave*.22;
  }
}

export function createVehicle(spec,p,track){return buildSuspensionState(createPhase4Vehicle(spec,p,track));}

export function stepVehicle(car,input,track,dt=FIXED_DT){
  prepareSuspensionLoads(car,track,dt);
  stepPhase4Vehicle(car,input,track,dt);
  finishSuspensionFrame(car);
}

export function resetVehicle(car,track){
  const ok=resetPhase4Vehicle(car,track);if(ok)resetSuspensionState(car);return ok;
}

export const MW5_INTERNALS={springForce,staticCompression,digressiveVelocity,damperForce,roadHeight,prepareSuspensionLoads,buildSuspensionState};
