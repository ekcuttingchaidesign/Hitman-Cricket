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
 // Recreate only the old sleeve-root placement for a matched-pose comparison.
 if(label==='before')s.batter.sleeves.forEach((sleeve,i)=>{const update=sleeve.update.bind(sleeve);sleeve.update=(a,j,b)=>{a.copy(s.batter.arms[i].shoulder).lerp(s.batter.torso.position,.25);update(a,j,b);};});
 s.render(0);
},label);
await mkdir('test-results/shoulders',{recursive:true});
const stats=[];
for(const [name,shot,y,charge,loft,t] of [
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
await browser.close();server.kill();await writeFile(`test-results/shoulders/${label}-metrics.json`,JSON.stringify({stats,errors},null,2));console.log(JSON.stringify({label,stats,errors}));if(errors.length)process.exitCode=1;
