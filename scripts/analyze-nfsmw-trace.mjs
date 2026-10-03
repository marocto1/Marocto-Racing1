import {readFileSync} from 'node:fs';

const path=process.argv[2];
if(!path){console.error('Usage: node scripts/analyze-nfsmw-trace.mjs <traza_coche.csv>');process.exit(2);}
const lines=readFileSync(path,'utf8').trim().split(/\r?\n/);
if(lines.length<3)throw new Error('Trace is too short');
const header=lines.shift().split(',');
const idx=Object.fromEntries(header.map((name,i)=>[name,i]));
for(const name of ['segundos','x','y','vx','vy','fx','fy','modo','stick'])if(!(name in idx))throw new Error(`Missing column ${name}`);
const rows=lines.map(line=>line.split(',')).map(c=>({
  t:Number(c[idx.segundos]),x:Number(c[idx.x]),y:Number(c[idx.y]),vx:Number(c[idx.vx]),vy:Number(c[idx.vy]),
  fx:Number(c[idx.fx]),fy:Number(c[idx.fy]),mode:Number(c[idx.modo]),stick:Number(c[idx.stick])
})).filter(r=>Object.values(r).every(Number.isFinite));
if(rows.length<3)throw new Error('No usable samples');
const speeds=rows.map(r=>Math.hypot(r.vx,r.vy));
const acc=[],yaw=[],turnGain=[];
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
for(let i=1;i<rows.length;i++){
  const a=rows[i-1],b=rows[i],dt=b.t-a.t;if(!(dt>0&&dt<.2))continue;
  const va=Math.hypot(a.vx,a.vy),vb=Math.hypot(b.vx,b.vy);acc.push((vb-va)/dt);
  const ha=Math.atan2(a.fy,a.fx),hb=Math.atan2(b.fy,b.fx),yr=wrap(hb-ha)/dt;yaw.push(yr);
  const stick=b.stick/32767;if(Math.abs(stick)>.05&&vb>4)turnGain.push(yr/stick);
}
const sorted=a=>[...a].sort((x,y)=>x-y);
const percentile=(a,p)=>{if(!a.length)return null;const s=sorted(a),i=Math.min(s.length-1,Math.max(0,Math.round((s.length-1)*p)));return s[i];};
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const out={
  samples:rows.length,duration_s:rows.at(-1).t-rows[0].t,
  speed_kmh:{avg:avg(speeds)*3.6,p50:percentile(speeds,.5)*3.6,p90:percentile(speeds,.9)*3.6,max:Math.max(...speeds)*3.6},
  longitudinal_accel_mps2:{p10:percentile(acc,.1),avg:avg(acc),p90:percentile(acc,.9)},
  yaw_rate_rads:{p10:percentile(yaw,.1),avg:avg(yaw),p90:percentile(yaw,.9)},
  steering_yaw_gain_rads_per_full_stick:{avg:avg(turnGain),p50:percentile(turnGain,.5),p90:percentile(turnGain,.9)},
  modes:[...new Set(rows.map(r=>r.mode))],
  note:'Feed repeated NFSMW traces from the same maneuver into this summary to tune physics-nfsmw.js.'
};
console.log(JSON.stringify(out,null,2));
