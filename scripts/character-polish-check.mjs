// Actual characters and game lighting; run against either checkout for comparisons.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const label = process.argv[2] ?? 'after';
const project = process.env.RENDER_PROJECT ?? process.cwd();
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5201'],
  { cwd: project, env: { ...process.env, VITE_SHOW_SURVIVE: '1' }, stdio: 'ignore' });
process.on('exit', () => server.kill());
for (let i=0;i<60;i++) { try { if ((await fetch('http://127.0.0.1:5201')).ok) break; } catch {} await new Promise(r=>setTimeout(r,250)); }
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 600, height: 850 }, deviceScaleFactor: 1 });
const errors=[];
page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/polish-lab',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><div id="ground" style="width:600px;height:850px"></div></body>'}));
await page.goto('http://127.0.0.1:5201/polish-lab');
await page.evaluate(async()=>{
 const T=await import('/node_modules/three/build/three.module.js');
 const {GameScene}=await import('/src/scene/GameScene.ts');
 const {Batter}=await import('/src/entities/Batter.ts');
 const {Bowler}=await import('/src/entities/Bowler.ts');
 const {Cricketer}=await import('/src/entities/Cricketer.ts');
 const scene=window.lab=new GameScene(document.querySelector('#ground'));scene.render(0);
 window.labTypes={T,Batter,Bowler,Cricketer};window.studioCamera=new T.PerspectiveCamera(32,600/850,.1,100);
});
const out=`test-results/character-polish/${label}`; await mkdir(out,{recursive:true});
const game=await page.evaluate(()=>{const s=window.lab;return {png:s.renderer.domElement.toDataURL('image/png').split(',')[1],calls:s.renderer.info.render.calls,triangles:s.renderer.info.render.triangles};});
await writeFile(`${out}/game.png`,Buffer.from(game.png,'base64')); delete game.png;
await page.evaluate(()=>{
 const s=window.lab,{T,Batter,Bowler,Cricketer}=window.labTypes;
 s.world.visible=false;s.scene.children.forEach(o=>{if(!o.isLight)o.visible=false;});s.scene.fog=null;s.scene.background=new T.Color(0xe9ece8);
 const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:0xe9ece8,roughness:1}));
 floor.rotation.x=-Math.PI/2;floor.position.y=-.015;floor.receiveShadow=true;s.scene.add(floor);
 window.actors={batter:new Batter(),bowler:new Bowler(),fielder:new Cricketer()};
 for(const actor of Object.values(window.actors)){actor.root.visible=false;s.scene.add(actor.root);}
});
for(const [name,actor,pose,angle] of [
 ['batter-front','batter','guard',315],['batter-rear','batter','guard',180],['batter-side','batter','guard',90],
 ['batter-loft','batter','loft',180],['batter-walk','batter','walk',270],
 ['fielder-front','fielder','rest',0],['fielder-catch','fielder','catch',35],
 ['bowler-release','bowler','release',180],['bowler-recovery','bowler','recovery',180],
 ['fielder-whites','fielder','whites',0],
]){
 const png=await page.evaluate(({actor,pose,angle})=>{
  const s=window.lab,{T}=window.labTypes,a=window.actors[actor];
  for(const b of Object.values(window.actors))b.root.visible=b===a;
  if(actor==='batter'){
   a.reset();a.prepare(1);a.update(0);
   if(pose==='loft'){a.swing('STRAIGHT',0,0,.54,1.3,false,true);a.update(500);}
   if(pose==='walk'){a.swing('STRAIGHT',0,0,.54,2.06,true);a.update(1250);}
  }else if(actor==='bowler'){a.reset();a.animate(pose==='release'?840:1960);}
  else {a.apply(a.rest());if(pose==='catch')a.catchAt(1);if(pose==='whites')a.dress({shirt:0xf4f0e4,trousers:0xf4f0e4,skin:0xb77950,trim:0x2f5a88,cap:0x2f5a88,shoe:0xfbf7ec});}
  a.root.position.set(0,0,0);
  const c=window.studioCamera,r=angle*Math.PI/180;const raised=pose==='release'||pose==='catch',distance=raised?4.65:3.95;c.position.set(Math.sin(r)*distance,1.3,Math.cos(r)*distance);c.lookAt(0,raised?1.08:.91,0);
  s.renderer.render(s.scene,c);return s.renderer.domElement.toDataURL('image/png').split(',')[1];
 },{actor,pose,angle});
 await writeFile(`${out}/${name}.png`,Buffer.from(png,'base64'));
}
const cpu=await page.evaluate(()=>{
 const {batter,bowler,fielder}=window.actors;
 batter.reset();batter.swing('STRAIGHT',0,0,.54,1.3,false,true);
 const run=()=>{for(let i=0;i<180;i++){batter.update(i*5);bowler.animate(i*14);fielder.catchAt((i%60)/60);}};
 run();const samples=[];for(let p=0;p<5;p++){const t=performance.now();run();samples.push((performance.now()-t)/180);}samples.sort((a,b)=>a-b);
 return {threeCharacterUpdateMedianMs:samples[2],samples};
});
await browser.close();server.kill();const metrics={game,cpu,errors};
await writeFile(`${out}/metrics.json`,JSON.stringify(metrics,null,2));console.log(JSON.stringify({label,...metrics}));if(errors.length)process.exitCode=1;
