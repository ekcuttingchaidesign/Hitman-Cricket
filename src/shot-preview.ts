import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Batter, CHARGE_DURATION_MS, CHARGE_CONTACT_MS, STROKE_DURATION_MS, STROKE_CONTACT_MS, PULL_LOAD_MS, PULL_CONTACT_MS } from './entities/Batter';
import { GAME } from './config/gameplay';

// Isolated from Game: inspecting a pose never submits scores or analytics.
const stage = document.querySelector<HTMLDivElement>('#stage')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
stage.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#142221');
const camera = new THREE.PerspectiveCamera(40, 1, .1, 50);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-.2, .85, 1.6);
camera.position.set(-3, 2.5, -3.4); controls.update();
scene.add(new THREE.HemisphereLight(0xffffff, 0x53634a, 2.5));
const light = new THREE.DirectionalLight(0xffedda, 3);
light.position.set(-3, 6, -1); light.castShadow = true; scene.add(light);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 10), new THREE.MeshStandardMaterial({ color: 0x897e5d, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(8, 16, 0xa6b296, 0x777958); grid.position.y = .002; scene.add(grid);
const batter = new Batter(); scene.add(batter.root);
const shot = document.querySelector<HTMLSelectElement>('#shot')!;
for (const [value,label] of [['cover','Cover drive'],['straight','Straight drive']]) {
  const option=document.createElement('option'); option.value=value; option.textContent=label; shot.append(option);
}
const impactTime=()=>shot.value==='charge'?CHARGE_CONTACT_MS:shot.value==='pull'?PULL_CONTACT_MS:STROKE_CONTACT_MS;
const speed = document.querySelector<HTMLSelectElement>('#speed')!;
const scrub = document.querySelector<HTMLInputElement>('#scrub')!;
const play = document.querySelector<HTMLButtonElement>('#play')!;
let playing = true, age = 0, previous = performance.now();
function reset() {
  scrub.max = String(shot.value === 'charge' ? CHARGE_DURATION_MS : STROKE_DURATION_MS);
  batter.reset(); batter.prepare(1); batter.update(0);
  batter.swing(shot.value==='cover'?'COVER_LONG_OFF':shot.value === 'pull' ? 'LEG' : 'STRAIGHT', 0,
    shot.value==='cover'?.30:0, shot.value === 'pull' ? 1.12 : .54, GAME.contactZ, shot.value === 'charge');
}
reset(); shot.onchange = () => { age = 0; reset(); };
play.onclick = () => { playing = !playing; play.textContent = playing ? 'Pause' : 'Play'; };
scrub.oninput = () => { playing = false; play.textContent = 'Play'; age = Number(scrub.value); };
document.querySelector<HTMLButtonElement>('#camera')!.onclick = () => {
  camera.up.set(0,1,0);
  camera.position.set(0, 2.9, -5.15); controls.target.set(0, 1.05, 9); controls.update();
};
const review = document.createElement('section');
review.setAttribute('aria-label','Pose review controls');
document.querySelector('main')!.insertBefore(review,scrub);
for (const name of ['Front','Side','Grip close-up','Load-up','Contact','Extension','Finish']) {
  const button=document.createElement('button'); button.textContent=name; review.append(button);
  button.onclick=()=>{
    if(name==='Grip close-up') {
      playing=false; play.textContent='Play'; batter.update(Math.min(age,Number(scrub.max)));
      const q=batter.bat.getWorldQuaternion(new THREE.Quaternion());
      controls.target.copy(batter.bat.localToWorld(new THREE.Vector3(0,.02,0)));
      // Match the supplied close-up: blade above, butt below, spine visible.
      camera.up.set(0,-1,0).applyQuaternion(q);
      camera.position.copy(controls.target).add(new THREE.Vector3(.12,.18,-.68).applyQuaternion(q));
      controls.update();
    } else if(name==='Front'||name==='Side') {
      camera.up.set(0,1,0);
      const down=batter.inspect().downPitch;
      controls.target.set(-.10,1.2,GAME.stanceZ+down);
      if(name==='Front') camera.position.set(.3,2,6+down);
      else camera.position.set(4.5,2,1+down);
      controls.update();
    } else {
      const phases=shot.value==='charge'?[330,CHARGE_CONTACT_MS,560,740]:shot.value==='pull'?[PULL_LOAD_MS,PULL_CONTACT_MS,340,500]:[0,STROKE_CONTACT_MS,220,410];
      age=phases[['Load-up','Contact','Extension','Finish'].indexOf(name)];
      playing=false; play.textContent='Play'; batter.update(age);
    }
  };
}
new ResizeObserver(() => {
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  camera.aspect = stage.clientWidth / stage.clientHeight; camera.updateProjectionMatrix();
}).observe(stage);
renderer.setAnimationLoop(now => {
  const duration = Number(scrub.max);
  if (playing) age = (age + Math.min(now - previous, 50) * Number(speed.value)) % (duration+300);
  previous = now;
  const time = Math.min(age, duration); batter.update(time); scrub.value = String(time);
  const impact = impactTime();
  document.querySelector<HTMLOutputElement>('#time')!.value = `${Math.round(time)} ms · contact ${impact} ms`;
  controls.update(); renderer.render(scene, camera);
});
