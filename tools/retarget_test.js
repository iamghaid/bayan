// Regression: smoothed parents must not inject rotation into wrists/fingers.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ROOT = path.join(__dirname, '..'), THREE = require(path.join(ROOT, 'lib/three.min.js'));
const source = fs.readFileSync(path.join(ROOT, 'signer.js'), 'utf8');
const marker = '    init, playList, stop, load,';
assert(source.includes(marker));
const instrumented = source.replace(marker,
  marker + '\n    testTorso:torsoClearance, testSet:set, testSetHand:setHand, testWrist:constrainWrist, testDt:dt=>{rotationDt=dt;}, testAimHand:aimHand, testRig:(map, rest, bind) => { boneMap=map; vrm={}; BIND=bind||null; Object.assign(REST_W,rest); },');
const sandbox = {THREE, window:{}, console};
vm.createContext(sandbox); vm.runInContext(instrumented + '\nthis.testSigner=Signer;', sandbox);
const player = sandbox.testSigner;
const q = (x,y,z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z));
const scene = new THREE.Object3D(), parent = new THREE.Object3D(), hand = new THREE.Object3D();
scene.add(parent); parent.add(hand);
player.testRig({hand_r:hand}, {RightHand:{q:q(0,0,0), dir:new THREE.Vector3(0,1,0), across:new THREE.Vector3(1,0,0)}});
function world() { return hand.getWorldQuaternion(new THREE.Quaternion()); }
function close(a,b) { assert(a.angleTo(b) < 1e-7, 'world orientation diverged'); }
// Old code copies local calculated using a future parent, giving a wrong wrist.
parent.quaternion.copy(q(.4,-.6,.2)); scene.updateMatrixWorld(true);
let target = q(-.2,.3,.5), futureParent=q(.9,.7,-.8);
let stale = futureParent.clone().invert().multiply(target);
player.testSet('RightHand',{world:target,local:stale},1); close(world(),target);
// Half smoothing follows the actual world orientation's shortest arc.
parent.quaternion.copy(q(-.3,.8,.5)); scene.updateMatrixWorld(true);
const start=world(), expected=start.clone().slerp(target,.5);
player.testSet('RightHand',{world:target,local:stale},.5); close(world(),expected);
// Correct steady-state inputs retain their former result.
stale=parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(target);
player.testSet('RightHand',{world:target,local:stale},1); close(world(),target);
assert.strictEqual(player.testAimHand('RightHand',new THREE.Vector3(),new THREE.Vector3(1,0,0),q(0,0,0)),null);
assert.strictEqual(player.testAimHand('RightHand',new THREE.Vector3(0,1,0),new THREE.Vector3(0,2,0),q(0,0,0)),null);
// A 180-degree tracking flip advances by at most 9 degrees at 60 fps,
// even if the parent moved drastically during this frame.
const previous=world(); parent.quaternion.copy(q(1.3,-1.4,.9));scene.updateMatrixWorld(true);
target=previous.clone().multiply(q(Math.PI,0,0));
player.testSetHand('RightHand',{world:target},previous,1);
assert(Math.abs(previous.angleTo(world())*180/Math.PI-9)<1e-6);
// The same bound scales with elapsed time at 120 fps.
player.testDt(1/120);const nextStart=world();
player.testSetHand('RightHand',{world:target},nextStart,1);
assert(Math.abs(nextStart.angleTo(world())*180/Math.PI-4.5)<1e-6);
parent.quaternion.identity(); hand.position.set(0,0,.3); hand.quaternion.copy(q(0,0,Math.PI*.95));
player.testRig({hand_r:hand,lowerarm_r:parent}, {RightLowerArm:{q:q(0,0,0),dir:new THREE.Vector3(0,0,1)}}, {RightHand:q(0,0,0)});
scene.updateMatrixWorld(true);const beforeRoll=world(), wristPosition=hand.getWorldPosition(new THREE.Vector3());
player.testWrist('Right'); close(world(),beforeRoll);
assert(hand.getWorldPosition(new THREE.Vector3()).distanceTo(wristPosition)<1e-8);
assert(hand.quaternion.angleTo(q(0,0,0))<1e-7,'twist remained in wrist');
parent.quaternion.identity();hand.quaternion.copy(q(2*Math.PI/3,0,0));scene.updateMatrixWorld(true);
player.testWrist('Right');
assert(Math.abs(hand.quaternion.angleTo(q(0,0,0))*180/Math.PI-75)<1e-6,'extreme wrist bend not limited');
// Endpoints outside the chest still need a swept-path collision check.
const body={x:0,y:1,z:0,rx:.25,ry:.4,rz:.15};
const point=(x,y,z)=>new THREE.Vector3(x,y,z);
assert(player.testTorso(null,point(0,1,0),.02,body)>.17);
assert.strictEqual(player.testTorso(null,point(0,1,.25),.02,body),0);
assert.strictEqual(player.testTorso(null,point(.4,1,0),.02,body),0);
assert(player.testTorso(point(-.4,1,0),point(.4,1,0),.02,body)>0);
assert.strictEqual(player.testTorso(point(-.4,1,.25),point(.4,1,.25),.02,body),0);
assert.strictEqual(player.testTorso(null,point(0,1.8,0),.02,body),0);
assert(player.testTorso(point(0,1,.3),point(0,1,-.3),.02,body)>0);
assert(player.testTorso(point(0,1,0),point(0,1,0),.02,body)<.2);
assert.strictEqual(player.testTorso(point(0,1,0),point(0,1,.3),.02,body),0);
console.log('20 retarget regression checks passed');
