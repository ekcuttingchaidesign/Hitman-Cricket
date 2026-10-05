import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir,writeFile } from 'node:fs/promises';
const label=process.argv[2]??'after';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5201'],{env:{...process.env,VITE_SHOW_SURVIVE:'1'},stdio:'ignore'});
process.on('exit',()=>server.kill());
for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:5201')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1.5,isMobile:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/shoulder-lab',r=>r.fulfill({contentType:'text/html',body:'<head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="ground" style="width:100vw;height:100vh"></div></body>'}));
await page.goto('http://127.0.0.1:5201/shoulder-lab');
await page.evaluate(async label=>{
 const {GameScene}=await import('/src/scene/GameScene.ts');const s=window.labScene=new GameScene(document.querySelector('#ground'));
 // Recreate the preceding preview's overlapping torso and narrow sleeves.
 if(label==='before'){
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {jerseyGeometry}=await import('/src/entities/garment.ts');
  const {BendingLimb}=await import('/src/entities/BendingLimb.ts');
  const batter=s.batter;
  batter.connectedJersey.mesh.visible=false;batter.connectedJersey.update=()=>{};
  const jersey=new THREE.Mesh(jerseyGeometry(),batter.palette.shirt);jersey.castShadow=jersey.receiveShadow=true;batter.torso.add(jersey);
  batter.sleeves=[0,1].map(i=>{
   const sleeve=new BendingLimb([batter.palette.shirt,batter.palette.skin],[.072,.062,.046]);
   const update=sleeve.update.bind(sleeve),root=new THREE.Vector3();
   sleeve.update=(_a,j,b)=>{root.set(i===0?-.09:.09,.015,0).applyQuaternion(batter.torso.quaternion).add(batter.torso.position);update(root,j,b);};
   batter.root.add(sleeve.mesh);return sleeve;
  });
 }
 s.render(0);
},label);
await mkdir('test-results/shoulders',{recursive:true});
const stats=[];
for(const [name,shot,y,charge,loft,t] of [
 ['guard','STRAIGHT',.54,false,false,0],
 ['straight-load','STRAIGHT',.54,false,false,160],['straight-high','STRAIGHT',.54,false,false,450],
 ['lofted','STRAIGHT',.54,false,true,500],['cover','COVER_LONG_OFF',.54,false,false,450],
 ['charge','STRAIGHT',.54,true,false,650],['pull','LEG',1.12,false,false,500],['century',null,.54,false,false,900],
]){
 const data=await page.evaluate(({name,shot,y,charge,loft,t})=>{
  const s=window.labScene;s.reset();s.batter.prepare(1);s.batter.update(0);
  if(shot)s.batter.swing(shot,0,0,y,charge?2.06:1.3,charge,loft);else s.celebrate(0);
  s.render(t);
  return {png:s.renderer.domElement.toDataURL('image/png').split(',')[1],calls:s.renderer.info.render.calls,triangles:s.renderer.info.render.triangles};
 },{name,shot,y,charge,loft,t});
 await writeFile(`test-results/shoulders/${label}-${name}.png`,Buffer.from(data.png,'base64'));stats.push({name,calls:data.calls,triangles:data.triangles});
}
const cpu=await page.evaluate(()=>{
 const b=window.labScene.batter;b.reset();b.prepare(1);b.swing('STRAIGHT',0,0,.54,1.3,false,true);
 for(let i=0;i<300;i++)b.update(i%900);
 const samples=[];
 for(let pass=0;pass<7;pass++){
  const begin=performance.now();for(let i=0;i<300;i++)b.update(i%900);
  samples.push((performance.now()-begin)/300);
 }
 samples.sort((a,b)=>a-b);return {medianBatterUpdateMs:samples[3],samples};
});
await browser.close();server.kill();await writeFile(`test-results/shoulders/${label}-metrics.json`,JSON.stringify({stats,errors,cpu},null,2));console.log(JSON.stringify({label,stats,errors,cpu}));if(errors.length)process.exitCode=1;
