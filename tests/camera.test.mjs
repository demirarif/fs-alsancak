import test from 'node:test';
import assert from 'node:assert/strict';
import {createCameraDirector,cameraClearance,standsBehindCamera} from '../src/v1/rendering/camera-director.ts';
import {CAMERA_POLICY} from '../src/v1/config/defaults.ts';

const ASPECT=16/9,ball=(x,z=0,y=0)=>({ball:{x,y,z}});
function run(director,subject,seconds,fps=60,aspect=ASPECT){let pose;for(let i=0;i<Math.round(seconds*fps);i++)pose=director.update(subject,1/fps,aspect);return pose;}
const distance2=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const settled=(preset,subject,seconds=6)=>{const d=createCameraDirector(preset);return {d,pose:run(d,subject,seconds)};};

test('every preset stays above the turf and the stands across the whole pitch',()=>{
  for(const preset of ['broadcast','wide','goal'])for(let x=-52;x<=52;x+=13)for(const z of [-33,0,33]){
    const {pose}=settled(preset,ball(x,z),3);
    assert.ok(pose.position.y>=cameraClearance(pose.position.x,pose.position.z)-1e-9,`${preset} ${x},${z} y=${pose.position.y}`);
    assert.ok(pose.position.y>=CAMERA_POLICY.clearance.turf);assert.ok(pose.verticalFovDegrees>=CAMERA_POLICY.verticalFovDegrees.min&&pose.verticalFovDegrees<=CAMERA_POLICY.verticalFovDegrees.max);
  }
});
test('TV broadcast sits on the main stand at halfway height and keeps the ball centred',()=>{
  const {pose}=settled('broadcast',ball(10,-5));
  assert.ok(pose.position.z>60&&pose.position.y>15,'main stand gantry');assert.ok(distance2(pose.target,{x:10,z:-5})<.2,'aim on the ball');
  const tilt=Math.atan2(pose.position.y,Math.hypot(pose.position.x-pose.target.x,pose.position.z-pose.target.z))*180/Math.PI;assert.ok(tilt>12&&tilt<30,`tilt ${tilt}`);
});
test('broadcast moves along the rail and tightens as play approaches a goal',()=>{
  const mid=settled('broadcast',ball(0)).pose,attack=settled('broadcast',ball(46)).pose,back=settled('broadcast',ball(-46)).pose;
  assert.ok(attack.position.x>mid.position.x+15&&back.position.x<mid.position.x-15);
  assert.ok(attack.verticalFovDegrees<mid.verticalFovDegrees-2,`${attack.verticalFovDegrees} vs ${mid.verticalFovDegrees}`);
  assert.ok(Math.abs(attack.position.x)<=CAMERA_POLICY.presets.broadcast.railLimit+1e-9);
});
test('wide comes from the near-left corner and sees the whole pitch',()=>{
  const {pose}=settled('wide',ball(30,10));assert.ok(pose.position.x<-60&&pose.position.z>60&&pose.position.y>40);
  const horizontal=2*Math.atan(Math.tan(pose.verticalFovDegrees*Math.PI/360)*ASPECT)*180/Math.PI;assert.ok(horizontal>=CAMERA_POLICY.presets.wide.horizontalFovDegrees-.5);
  const narrow=run(createCameraDirector('wide'),ball(0),3,60,.46),far=Math.hypot(narrow.position.x-narrow.target.x,narrow.position.z-narrow.target.z);
  assert.ok(narrow.verticalFovDegrees<=CAMERA_POLICY.verticalFovDegrees.max+1e-9);assert.ok(far>Math.hypot(pose.position.x-pose.target.x,pose.position.z-pose.target.z),'phone steps back instead of a fisheye lens');
});
test('behind-the-goal follows the attacked end with hysteresis and swings over the main stand',()=>{
  const d=createCameraDirector('goal');let pose=run(d,ball(30),4);
  assert.ok(pose.position.x>52.5,'behind the right goal');assert.equal(d.getState().attackedEnd,1);
  pose=run(d,ball(4),3);assert.ok(pose.position.x>52.5,'small drift past halfway does not switch');
  let minZ=Infinity;for(let i=0;i<240;i++){pose=d.update(ball(-30),1/60,ASPECT);minZ=Math.min(minZ,pose.position.z);}
  assert.equal(d.getState().attackedEnd,-1);assert.ok(pose.position.x<-52.5,'behind the left goal');assert.ok(minZ>-5,`swing stays on the main side, min z ${minZ}`);
  assert.equal(createCameraDirector('goal').update({...ball(5),attackedEnd:-1},1/60,ASPECT).position.x<0,true,'possession direction wins over ball side');
});
test('user orbit and zoom persist while the automatic camera follows the ball',()=>{
  const plain=createCameraDirector('broadcast'),user=createCameraDirector('broadcast');run(plain,ball(0),1);run(user,ball(0),1);
  user.apply({kind:'orbit',deltaAzimuth:.5,deltaElevation:.2});user.apply({kind:'zoom',factor:.7});
  const a=run(plain,ball(35,12),5),b=run(user,ball(35,12),5),s=user.getState(),p=plain.getState();
  assert.equal(s.mode,'auto-follow');assert.ok(distance2(b.target,{x:35,z:12})<.3,'still following');
  assert.ok(Math.abs(s.orbit.azimuthRadians-p.orbit.azimuthRadians-.5)<1e-6);assert.ok(Math.abs(s.orbit.elevationRadians-p.orbit.elevationRadians-.2)<1e-6);
  assert.ok(Math.abs(s.orbit.distanceMeters/p.orbit.distanceMeters-.7)<1e-6);assert.notDeepEqual(a.position,b.position);
});
test('pan switches to free camera; the ball no longer moves it; resume keeps the angle',()=>{
  const d=createCameraDirector('broadcast');run(d,ball(0),2);d.apply({kind:'orbit',deltaAzimuth:-.4,deltaElevation:0});
  d.apply({kind:'pan',screenDx:.2,screenDy:0});assert.equal(d.getState().mode,'free');const held=run(d,ball(0),.2).target;
  const after=run(d,ball(40,20),3).target;assert.ok(distance2(held,after)<1e-9,'free camera ignores the ball');assert.ok(distance2(held,{x:0,z:0})>3,'pan moved the aim');
  const angle=d.getState().orbit.azimuthRadians;d.apply({kind:'resume-follow'});assert.equal(d.getState().mode,'auto-follow');
  assert.ok(Math.abs(d.getState().orbit.azimuthRadians-angle)<1e-6,'no jump on resume');
  const back=run(d,ball(40,20),5).target;assert.ok(distance2(back,{x:40,z:20})<.5,'aim returns to the ball');
  assert.ok(Math.abs(d.getState().userOffset.azimuthRadians)>.2,'user angle survives resume');
});
test('presets and reset clear user offsets without a jump',()=>{
  const d=createCameraDirector('broadcast');let pose=run(d,ball(10),2);d.apply({kind:'orbit',deltaAzimuth:1,deltaElevation:.3});pose=run(d,ball(10),.1);
  d.apply({kind:'set-preset',preset:'goal'});const first=d.update(ball(10),1/60,ASPECT);
  assert.ok(Math.hypot(first.position.x-pose.position.x,first.position.y-pose.position.y,first.position.z-pose.position.z)<3,'first frame is continuous');
  assert.deepEqual(d.getState().userOffset,{azimuthRadians:0,elevationRadians:0,zoomFactor:1});assert.equal(d.getState().preset,'goal');
  run(d,ball(10),4);assert.ok(d.update(ball(10),1/60,ASPECT).position.x>52.5,'arrives behind the goal');
  d.apply({kind:'pan',screenDx:.3,screenDy:.1});d.apply({kind:'reset-view'});assert.equal(d.getState().mode,'auto-follow');
  assert.ok(distance2(run(d,ball(10),5).target,{x:10,z:0})<2);
});
test('manual limits: no camera under the pitch, distance and elevation stay bounded',()=>{
  const d=createCameraDirector('broadcast');run(d,ball(0),1);
  for(let i=0;i<40;i++){d.apply({kind:'orbit',deltaAzimuth:.37,deltaElevation:-.5});d.apply({kind:'zoom',factor:1.6});const p=d.update(ball(0),1/60,ASPECT);assert.ok(p.position.y>=cameraClearance(p.position.x,p.position.z)-1e-9);}
  assert.ok(d.getState().orbit.distanceMeters<=CAMERA_POLICY.distanceMeters.max+1e-9);assert.ok(d.getState().orbit.elevationRadians>=CAMERA_POLICY.elevationDegrees.min*Math.PI/180-1e-9);
  for(let i=0;i<40;i++)d.apply({kind:'zoom',factor:.5});assert.ok(d.getState().orbit.distanceMeters>=CAMERA_POLICY.distanceMeters.min-1e-9);
  d.apply({kind:'pan',screenDx:0,screenDy:0});for(let i=0;i<60;i++){d.apply({kind:'orbit',deltaAzimuth:.2,deltaElevation:-.3});d.apply({kind:'pan',screenDx:2,screenDy:-2});const p=d.update(ball(0),1/60,ASPECT);assert.ok(p.position.y>=cameraClearance(p.position.x,p.position.z)-1e-9);}
  assert.ok(Math.abs(d.getState().focus.x)<=54);
});
test('camera keeps moving on a paused match and is frame-rate independent',()=>{
  const d=createCameraDirector('broadcast'),still=ball(12,4),before=run(d,still,2);d.apply({kind:'orbit',deltaAzimuth:.3,deltaElevation:0});
  assert.notDeepEqual(d.update(still,1/60,ASPECT).position,before.position,'orbit works while the ball is still');
  const a=createCameraDirector('goal'),b=createCameraDirector('goal');run(a,ball(-20),1,60);run(b,ball(-20),1,30);
  const pa=run(a,ball(35,-10),2,60),pb=run(b,ball(35,-10),2,30);
  assert.ok(Math.hypot(pa.position.x-pb.position.x,pa.position.y-pb.position.y,pa.position.z-pb.position.z)<1.5,'60 fps ≈ 30 fps');
});
test('ball lead looks slightly ahead of a moving ball, clamped to the pitch',()=>{
  const {pose}=settled('broadcast',{ball:{x:20,y:0,z:0},ballVelocity:{x:10,y:0,z:0}});assert.ok(pose.target.x>20&&pose.target.x<=54);
  const edge=settled('broadcast',{ball:{x:52,y:0,z:0},ballVelocity:{x:30,y:0,z:0}}).pose;assert.ok(edge.target.x<=54);
});
test('no view shows the stand it stands in: the TV gantry leaves out the main stand, behind the goal the end stand (2026-11-04)',()=>{
  const tv=settled('broadcast',ball(0)).pose,goal=settled('goal',ball(40)).pose;
  assert.deepEqual(standsBehindCamera(tv.position),{side:1,end:0});assert.deepEqual(standsBehindCamera(goal.position),{side:0,end:1});
  assert.deepEqual(standsBehindCamera({x:0,z:0}),{side:0,end:0});
});
test('a phone held upright gets a higher, closer TV gantry and a picture of pitch, not sky (2026-11-04)',()=>{
  const PHONE=.46,land=settled('broadcast',ball(0)).pose,phone=run(createCameraDirector('broadcast'),ball(0),6,60,PHONE);
  const tilt=p=>Math.atan2(p.position.y,Math.hypot(p.position.x-p.target.x,p.position.z-p.target.z))*180/Math.PI;
  assert.ok(phone.position.y>land.position.y+5&&phone.position.z<land.position.z-10,`gantry ${phone.position.y.toFixed(1)}/${phone.position.z.toFixed(1)}`);
  assert.ok(phone.verticalFovDegrees<=40,`vertical fov ${phone.verticalFovDegrees.toFixed(1)}`);
  assert.ok(tilt(phone)-phone.verticalFovDegrees/2>=10,`top edge ${(tilt(phone)-phone.verticalFovDegrees/2).toFixed(1)}° below the horizon`);
});
test('at a throw-in the TV aim stays inside the touchline with the ball still in the picture',()=>{
  const {pose}=settled('broadcast',ball(0,34));assert.ok(pose.target.z<=CAMERA_POLICY.presets.broadcast.pitchBiasZ+1e-6,`aim z ${pose.target.z}`);
  const toBall=Math.atan2(pose.position.y,Math.abs(pose.position.z-34))-Math.atan2(pose.position.y,Math.abs(pose.position.z-pose.target.z));
  assert.ok(Math.abs(toBall)*180/Math.PI<pose.verticalFovDegrees/2,'ball in frame');
});

