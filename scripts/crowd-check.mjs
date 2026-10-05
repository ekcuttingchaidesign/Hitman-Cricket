import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5201'],{env:{...process.env,VITE_SHOW_SURVIVE:'1'},stdio:'ignore'});
process.on('exit',()=>server.kill());
for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:5201')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
await mkdir('test-results/crowd',{recursive:true});
const results=[];
for(const [name,width,height,reduce] of [['phone',390,844,false],['desktop',1280,720,false],['reduced',390,844,true]]){
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:name==='desktop'?1:1.5,isMobile:name!=='desktop',reducedMotion:reduce?'reduce':'no-preference'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/crowd-lab*',r=>r.fulfill({contentType:'text/html',body:'<head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="ground" style="width:100vw;height:100vh"></div></body>'}));
 await page.goto('http://127.0.0.1:5201/crowd-lab?perf=1');
 const stats=await page.evaluate(async()=>{
  const {GameScene}=await import('/src/scene/GameScene.ts');const {Game}=await import('/src/Game.ts');
  const s=window.labScene=new GameScene(document.querySelector('#ground'));s.render(0);
  window.idleDraws=s.renderer.info.render.calls;
  const calls=[];
  const fake={scene:s,elapsed:0,lesson:0,hud:{result(){},milestone(){}},audio:{play(){},cheer(seconds){calls.push(seconds)}},chargeMiss:null};
  window.present=(runs,wicket=false)=>{fake.outcome={runs,isWicket:wicket,madeBatContact:true,aerial:false};Game.prototype.presentResult.call(fake);};
  window.milestone=kind=>Game.prototype.celebrate.call(fake,kind);
  for(const [runs,wicket] of [[1,false],[2,false],[0,true],[4,true]]){s.reset();window.present(runs,wicket);if(s.crowdState.kind!==null)throw Error('False crowd reaction');}
  if(calls.length)throw Error('False audio reaction');
  const data=[];
  for(const [runs,kind] of [[4,'four'],[6,'six']]){s.reset();window.present(runs);if(s.crowdState.kind!==kind)throw Error('Missing boundary reaction');data.push({kind,audio:calls.at(-1)});}
  for(const kind of ['fifty','century','six-sixes']){s.reset();window.milestone(kind);if(s.crowdState.kind!==kind)throw Error('Missing milestone');data.push({kind,audio:calls.at(-1)});}
  s.reset();return {idle:window.idleDraws,events:data};
 });
 for(const kind of ['four','six','fifty','century']){
  const event=await page.evaluate(kind=>{const s=window.labScene;s.reset();if(kind==='four'||kind==='six')window.present(kind==='four'?4:6);else window.milestone(kind);s.render(900);return {...s.crowdState,calls:s.renderer.info.render.calls,triangles:s.renderer.info.render.triangles};},kind);
  if(event.calls>stats.idle+4)throw Error('Crowd exceeded four extra draws');
  if(event.banners<4)throw Error('Too few banners');
  const png=await page.evaluate(()=>{window.labScene.render(900);return window.labScene.renderer.domElement.toDataURL('image/png').split(',')[1];});
  if(name!=='reduced')await writeFile(`test-results/crowd/${name}-${kind}.png`,Buffer.from(png,'base64'));
  results.push({name,...event});
 }
 await page.evaluate(()=>{
  const s=window.labScene,c=s.crowd;
  if(c.reducedMotion){s.render(1100);const a=Array.from(c.bodies.instanceMatrix.array);s.render(1300);if(a.some((v,i)=>v!==c.bodies.instanceMatrix.array[i]))throw Error('Reduced-motion crowd moved');}
  s.render(10000);if(s.crowdState.kind!==null||s.crowdState.banners!==0)throw Error('Crowd did not settle');
  if(s.renderer.info.render.calls!==window.idleDraws)throw Error('Idle draw cost did not recover');
  s.cheer('century',10000);s.cheer('four',10100);if(s.crowdState.kind!=='century')throw Error('Boundary replaced milestone');s.reset();
  if(s.crowdState.kind!==null)throw Error('Reset retained cheering');
 });
 if(errors.length)throw Error(errors.join('\n'));
 console.log(JSON.stringify({name,...stats,errors}));await page.close();
}
await writeFile('test-results/crowd/metrics.json',JSON.stringify(results,null,2));
await browser.close();server.kill();console.log('Crowd event, reset, reduced-motion and rendering checks passed.');
