// Regression: smoothed parents must not inject rotation into wrists/fingers.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ROOT = path.join(__dirname, '..'), THREE = require(path.join(ROOT, 'lib/three.min.js'));
const source = fs.readFileSync(path.join(ROOT, 'signer.js'), 'utf8');
const marker = '    init, playList, stop, load,';
assert(source.includes(marker));
const instrumented = source.replace(marker,
  marker + '\n    testSolveArm:solveArm, testChain:(side,rig)=>{ARM_RIG[side]=rig;}, testGeometry:armGeometry, testLimits:ARM_LIMITS, testTorso:torsoClearance, testSet:set, testSetHand:setHand, testWrist:constrainWrist, testDt:dt=>{rotationDt=dt;}, testAimHand:aimHand, testRig:(map, rest, bind) => { boneMap=map; vrm={}; BIND=bind||null; Object.assign(REST_W,rest); },');
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
parent.quaternion.identity(); hand.position.set(0,0,.3); hand.quaternion.copy(q(0,0,Math.PI/4));
player.testRig({hand_r:hand,lowerarm_r:parent}, {RightLowerArm:{q:q(0,0,0),dir:new THREE.Vector3(0,0,1)}}, {RightHand:q(0,0,0)});
scene.updateMatrixWorld(true);const beforeRoll=world(), wristPosition=hand.getWorldPosition(new THREE.Vector3());
player.testWrist('Right'); close(world(),beforeRoll);
assert(hand.getWorldPosition(new THREE.Vector3()).distanceTo(wristPosition)<1e-8);
assert(hand.quaternion.angleTo(q(0,0,0))<1e-7,'twist remained in wrist');
parent.quaternion.identity();hand.quaternion.copy(q(2*Math.PI/3,0,0));scene.updateMatrixWorld(true);
player.testWrist('Right');
assert(Math.abs(hand.quaternion.angleTo(q(0,0,0))*180/Math.PI-65)<1e-6,'extreme wrist bend not limited');
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
// Fixed-length hinge geometry survives folded, unreachable and flipped hints.
const shoulder=point(0,1.5,0), hint=point(-.3,1.25,.1), length1=.3,length2=.27;
const flexOf=g=>Math.acos(Math.max(-1,Math.min(1,g.elbow.clone().sub(shoulder).normalize().dot(g.wrist.clone().sub(g.elbow).normalize()))))*180/Math.PI;
for (const target of [point(-.5,1.3,.2),shoulder.clone(),point(-4,3,2),point(0,2.3,0)]) {
 const g=player.testGeometry(shoulder,hint,target,length1,length2,'Right',null,1/60);
 assert(Math.abs(g.elbow.distanceTo(shoulder)-length1)<1e-8,'upper arm length changed');
 assert(Math.abs(g.wrist.distanceTo(g.elbow)-length2)<1e-8,'forearm length changed');
 assert(flexOf(g)>=player.testLimits.flexMin-1e-6&&flexOf(g)<=player.testLimits.flexMax+1e-6,'elbow flexion escaped limits');
 assert(g.elbow.clone().sub(shoulder).angleTo(point(0,-1,0))*180/Math.PI<=165+1e-6,'shoulder elevation escaped limits');
}
const goal=point(0,1.5,.4), original=player.testGeometry(shoulder,hint,goal,.3,.27,'Right',null,1/60);
const flipped=player.testGeometry(shoulder,point(.3,1.8,0),goal,.3,.27,'Right',original.pole,1/60);
assert(original.pole.angleTo(flipped.pole)*180/Math.PI<=4+1e-6,'elbow pole flipped');
parent.quaternion.identity();hand.quaternion.copy(q(0,0,Math.PI*.95));scene.updateMatrixWorld(true);
player.testWrist('Right');
assert(parent.quaternion.angleTo(q(0,0,0))*180/Math.PI<=85+1e-6,'forearm roll escaped limits');
assert(hand.quaternion.angleTo(q(0,0,0))<1e-6,'axial twist remained in wrist');
parent.quaternion.identity();hand.quaternion.copy(q(0,Math.PI/3,0));scene.updateMatrixWorld(true);
player.testWrist('Right');
assert(hand.quaternion.angleTo(q(0,0,0))*180/Math.PI<=25+1e-6,'sideways wrist bend escaped limits');
// Exercise the actual bone hierarchy, not just the geometry helper.
const rigScene=new THREE.Object3D(), upperBone=new THREE.Object3D(), lowerBone=new THREE.Object3D(), wristBone=new THREE.Object3D();
rigScene.add(upperBone);upperBone.add(lowerBone);lowerBone.add(wristBone);
upperBone.position.set(-.2,1.5,0);lowerBone.position.set(-.3,0,0);wristBone.position.set(-.27,0,0);
const straight=new THREE.Vector3(-1,0,0), identity=new THREE.Quaternion();
player.testRig({upperarm_r:upperBone,lowerarm_r:lowerBone,hand_r:wristBone},
 {RightUpperArm:{q:identity.clone(),dir:straight.clone()},RightLowerArm:{q:identity.clone(),dir:straight.clone()},
 RightHand:{q:identity.clone(),dir:straight.clone(),across:new THREE.Vector3(0,0,1)}},
 {RightUpperArm:identity.clone(),RightLowerArm:identity.clone(),RightHand:identity.clone()});
player.testChain('Right',{upper:.3,lower:.27,axis:new THREE.Vector3(0,1,0)});
rigScene.updateMatrixWorld(true);
const destination=point(-.4,1.7,.25);
player.testSolveArm('Right',destination,point(-.45,1.3,.1));
const S=upperBone.getWorldPosition(new THREE.Vector3()), E=lowerBone.getWorldPosition(new THREE.Vector3()), W=wristBone.getWorldPosition(new THREE.Vector3());
assert(Math.abs(S.distanceTo(E)-.3)<1e-8,'solver changed upper length');
assert(Math.abs(E.distanceTo(W)-.27)<1e-8,'solver changed lower length');
assert(W.distanceTo(destination)<1e-7,'feasible wrist target was displaced');
const bendNormal=new THREE.Vector3().crossVectors(E.clone().sub(S),W.clone().sub(E)).normalize();
const hingeNormal=point(0,1,0).applyQuaternion(upperBone.getWorldQuaternion(new THREE.Quaternion()));
assert(bendNormal.angleTo(hingeNormal)<1e-7,'solver bent elbow sideways');
const slowBase=player.testGeometry(shoulder,hint,goal,.3,.27,'Right',null,1/60);
const slowUpper=slowBase.elbow.clone().sub(shoulder).normalize();
const slowLower=slowBase.wrist.clone().sub(slowBase.elbow).normalize();
const slowNormal=new THREE.Vector3().crossVectors(slowUpper,slowLower).normalize();
const limited=player.testGeometry(shoulder,point(.4,1.8,-.2),point(.5,1.8,-.1),.3,.27,'Right',slowBase.pole,1/60,
 {upper:slowUpper,flex:slowUpper.angleTo(slowLower),normal:slowNormal});
const nextUpper=limited.elbow.clone().sub(shoulder).normalize(),nextLower=limited.wrist.clone().sub(limited.elbow).normalize();
assert(nextUpper.angleTo(slowUpper)*180/Math.PI<=6+1e-6,'shoulder direction snapped');
assert(Math.abs(nextUpper.angleTo(nextLower)-slowUpper.angleTo(slowLower))*180/Math.PI<=6+1e-6,'elbow flexion snapped');
const transported=slowNormal.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(slowUpper,nextUpper));
assert(transported.angleTo(new THREE.Vector3().crossVectors(nextUpper,nextLower).normalize())*180/Math.PI<=4+1e-6,'shoulder roll snapped');
assert(Math.abs(limited.wrist.distanceTo(limited.elbow)-.27)<1e-8,'rate limit stretched forearm');
const halfTick=player.testGeometry(shoulder,point(.4,1.8,-.2),point(.5,1.8,-.1),.3,.27,'Right',slowBase.pole,1/120,
 {upper:slowUpper,flex:slowUpper.angleTo(slowLower),normal:slowNormal});
const halfUpper=halfTick.elbow.clone().sub(shoulder).normalize(),halfLower=halfTick.wrist.clone().sub(halfTick.elbow).normalize();
assert(halfUpper.angleTo(slowUpper)*180/Math.PI<=3+1e-6,'shoulder rate changed at 120 fps');
assert(Math.abs(halfUpper.angleTo(halfLower)-slowUpper.angleTo(slowLower))*180/Math.PI<=3+1e-6,'elbow rate changed at 120 fps');
console.log('50 retarget regression checks passed');
