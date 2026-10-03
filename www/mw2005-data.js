/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Handling values are adapted from the public UndercoverMWPhysics
 * CarDataDump by gaycoderprincess and contributors:
 * https://github.com/gaycoderprincess/UndercoverMWPhysics
 *
 * This module intentionally contains only the parameters used by the
 * Marocto Racing MW-family physics adaptation. It is not an EA data file dump.
 */

const mw=(source,brakes,chassis,tires,transmission,engine,induction=null)=>({source,brakes,chassis,tires,transmission,engine,induction});

export const MW_CAR_DATA={
  'Touring GTR · E46 inspired':mw('MW2005/bmwm3gtre46',
    {lock:[1,3],torque:[475,600],ebrake:925},
    {aeroCg:47.75,aero:.30,drag:.32,frontBias:54,rollCenter:9,rideHeight:[6,6],springs:[650,600],sway:[200,200],travel:[8,8],shock:[60,50],shockExt:[75,77],shockValving:[20,20],shockDigression:[.2,.2],springProgression:[7.5,7.5],shockBlowout:5},
    {dynamic:[2,2],gripScale:[1.175,1.225],static:[2.2,2.3],steering:.9,yaw:[.3,.65,1,1.2],yawSpeed:.25},
    {ratios:[3.2,0,4.1,2.53,1.67,1.23,1,.83],diff:[.8,.8,0],eff:[1,1,1,1,1,1,1,1,1],converter:.3,split:0,clutch:.8,shiftSpeed:.25,final:3.4},
    {torque:[170,251,340,428,467,452,411,375,350],braking:[.7,.8,.9],flywheel:10,maxRpm:9500,redline:8500,idle:800},
    {low:.2,high:.2,spool:.2,up:2,down:.25,vacuum:-.05,psi:12}),

  // R34 is not part of MW2005's player roster. Carbon's Skyline GT-R uses
  // the same Black Box MW-family suspension/handling model.
  'Vector R · R34 inspired':mw('Carbon/skyline',
    {lock:[1,3.3],torque:[475,575],ebrake:850},
    {aeroCg:48.5,aero:.27,drag:.31,frontBias:54,rollCenter:8.5,rideHeight:[8,8],springs:[725,675],sway:[325,200],travel:[7,7],shock:[65,67],shockExt:[80,80],shockValving:[19,19],shockDigression:[.4,.4],springProgression:[7,6.6],shockBlowout:6},
    {dynamic:[2,2.05],gripScale:[1.185,1.2],static:[2.25,2.25],steering:1.22,yaw:[.45,1,1.1,1.35],yawSpeed:.325},
    {ratios:[2.625,0,3.75,2.36,1.685,1.312,1.07,.85],diff:[.85,.85,.85],eff:[1,1,1,1,1,1,1,1,1],converter:.45,split:.5,clutch:.85,shiftSpeed:.25,final:4.2},
    {torque:[135,155,189,243,292,281,257,230,203],braking:[.7,.8,.9],flywheel:8,maxRpm:9000,redline:8000,idle:800}),

  'Apex J · Mk4 inspired':mw('MW2005/supra',
    {lock:[1,3.1],torque:[350,480],ebrake:600},
    {aeroCg:49,aero:.185,drag:.29,frontBias:53,rollCenter:9.5,rideHeight:[8,8],springs:[300,300],sway:[300,300],travel:[7.5,7.5],shock:[40,40],shockExt:[60,60],shockValving:[20,20],shockDigression:[.5,.5],springProgression:[7,7],shockBlowout:8},
    {dynamic:[1.5,1.5],gripScale:[1,1],static:[1.7,1.7],steering:1.05,yaw:[.05,.35,.5,.7],yawSpeed:.48},
    {ratios:[3,0,3.67,2.36,1.69,1.31,1,.77],diff:[.85,.85,0],eff:[1,1,1,1,1,1,1,1,1],converter:.5,split:0,clutch:.8,shiftSpeed:.25,final:3.5},
    {torque:[90,117,153,196,231,221,195,173,156],braking:[.7,.8,.9],flywheel:10,maxRpm:7800,redline:6800,idle:800},
    {low:.1,high:.15,spool:.2,up:2,down:.25,vacuum:-.05,psi:12}),

  'Rotary F · FD inspired':mw('MW2005/rx7',
    {lock:[1,3],torque:[330.2,430],ebrake:450},
    {aeroCg:47.7,aero:.17,drag:.29,frontBias:53,rollCenter:10,rideHeight:[8,8],springs:[450,450],sway:[200,300],travel:[7.56,7.56],shock:[45,45],shockExt:[50,50],shockValving:[15,15],shockDigression:[.4,.4],springProgression:[5.45,5.6],shockBlowout:5},
    {dynamic:[1.4,1.45],gripScale:[1,1],static:[1.6,1.6],steering:1.08,yaw:[.05,.06,.073,.08],yawSpeed:.7},
    {ratios:[2.8,0,3.483,2.015,1.391,1.12,.82],diff:[.7,.7,0],eff:[1,1,1,1,1,1,1,1,1],converter:.6,split:0,clutch:.8,shiftSpeed:.1,final:3.6},
    {torque:[86,121,167,224,224,201,184,173,161],braking:[.7,.8,.9],flywheel:15,maxRpm:9000,redline:8000,idle:800},
    {low:.1,high:.1,spool:.2,up:2.5,down:.25,vacuum:-.05,psi:15}),

  'Rally IX · Evo inspired':mw('MW2005/lancerevo8',
    {lock:[1,3],torque:[400,475],ebrake:500},
    {aeroCg:51.85,aero:.15,drag:.26,frontBias:54.75,rollCenter:10.5,rideHeight:[8,8],springs:[375,390],sway:[200,270],travel:[7,7],shock:[38.55,42.25],shockExt:[42,45],shockValving:[17,17],shockDigression:[.5,.5],springProgression:[5.5,6.25],shockBlowout:8},
    {dynamic:[1.35,1.37],gripScale:[1,1],static:[1.6,1.62],steering:1,yaw:[.075,.1,.2,.15],yawSpeed:.7},
    {ratios:[2.5,0,2.93,1.95,1.41,1.03,.77],diff:[.7,.7,.7],eff:[1,1,.9,.9,1,1,1,1,1],converter:.7,split:.5,clutch:.8,shiftSpeed:.1,final:3.6},
    {torque:[110,135,185,257,248,221,197,180,165],braking:[.7,.8,.9],flywheel:10,maxRpm:8000,redline:7000,idle:850},
    {low:.1,high:.2,spool:.2,up:2,down:.25,vacuum:-.05,psi:14}),

  'RearSport GT · 911 inspired':mw('MW2005/911turbo',
    {lock:[1,3.5],torque:[300,550],ebrake:650},
    {aeroCg:46.5,aero:.21,drag:.35,frontBias:53,rollCenter:9,rideHeight:[8.5,8.5],springs:[475,450],sway:[300,250],travel:[6.5,6.5],shock:[45,45],shockExt:[60,58],shockValving:[18,18],shockDigression:[.22,.22],springProgression:[6,6],shockBlowout:6},
    {dynamic:[1.7,1.9],gripScale:[1,1],static:[1.9,2.1],steering:1,yaw:[.25,.35,.6,1],yawSpeed:.7},
    {ratios:[3.2,0,3.82,2.05,1.41,1.12,.92,.75],diff:[.8,.8,.8],eff:[1,1,1,1,1,1,1,1,1],converter:.8,split:.5,clutch:.8,shiftSpeed:.25,final:3.44},
    {torque:[105,190,300,390,330,280,245,225,220],braking:[.93,.85,.86],flywheel:10,maxRpm:9400,redline:8400,idle:950},
    {low:.15,high:.15,spool:.2,up:2,down:.25,vacuum:-.1,psi:12})
};

export function getMWData(spec){
  return MW_CAR_DATA[spec?.name]||MW_CAR_DATA['Touring GTR · E46 inspired'];
}
