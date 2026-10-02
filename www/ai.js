const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));

export const AI_LEVELS=[
  {id:'rookie',name:'ROOKIE',speed:35,look:12,lookSpeed:.18,steer:1.05,yaw:.16,nitro:false,overtake:false},
  {id:'rival',name:'RIVAL',speed:43,look:14,lookSpeed:.20,steer:1.20,yaw:.18,nitro:true,overtake:true},
  {id:'pro',name:'PRO',speed:51,look:16,lookSpeed:.22,steer:1.32,yaw:.20,nitro:true,overtake:true},
  {id:'elite',name:'ELITE',speed:59,look:18,lookSpeed:.24,steer:1.45,yaw:.22,nitro:true,overtake:true}
];

export function createAIController(track){
  const contact={},aim={},far={};
  let still=0,lastX=0,lastZ=0;
  function reset(car){still=0;lastX=car.x;lastZ=car.z;contact.index=undefined;}
  function sample(car,player,levelIndex,dt){
    const level=AI_LEVELS[clamp(levelIndex|0,0,AI_LEVELS.length-1)];
    track.query(car.x,car.z,contact);
    const speed=Math.hypot(car.vx,car.vz),look=level.look+speed*level.lookSpeed;
    let lane=0;
    if(level.overtake&&player){
      const dx=player.x-car.x,dz=player.z-car.z,near=dx*dx+dz*dz<22*22;
      if(near){
        const playerLane=Number.isFinite(player.contact?.lateral)?player.contact.lateral:0;
        lane=playerLane>=0?-3.0:3.0;
      }
    }
    track.at(contact.s+look,lane,aim);track.at(contact.s+look*2.2,lane*.35,far);
    const desired=Math.atan2(aim.x-car.x,aim.z-car.z),error=wrap(desired-car.a);
    const nearHeading=Math.atan2(aim.tx,aim.tz),farHeading=Math.atan2(far.tx,far.tz);
    const curve=Math.abs(wrap(farHeading-nearHeading));
    const steer=clamp(-error*level.steer-car.yawRate*level.yaw,-1,1);
    let target=level.speed*(1-clamp(curve*1.45,0,.58));
    if(Math.abs(contact.lateral)>track.halfWidth*.72)target*=.62;
    if(contact.surface!=='asphalt'&&contact.surface!=='curb')target*=.48;
    const overspeed=speed-target,brake=overspeed>1.5?clamp(overspeed/13,0,1):0;
    const throttle=brake>.08?0:(speed<target?1:.18);
    const nitro=level.nitro&&curve<.075&&Math.abs(error)<.10&&speed<target*.90&&car.n>42?1:0;
    const moved=Math.hypot(car.x-lastX,car.z-lastZ);lastX=car.x;lastZ=car.z;
    if(speed<1.2&&throttle>.5&&moved<.035)still+=dt;else still=Math.max(0,still-dt*2);
    const resetNow=still>3.2||contact.distance>track.barrierOffset+2;
    if(resetNow)still=0;
    return {throttle,brake,left:steer<0?-steer:0,right:steer>0?steer:0,nitro,handbrake:0,reset:resetNow?1:0,steer};
  }
  return {reset,sample};
}
