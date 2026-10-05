// Actual game model, frozen in guard; eight camera views, production lighting.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5201'], {env:{...process.env,VITE_SHOW_SURVIVE:'1'},stdio:'ignore'});
process.on('exit',()=>server.kill());
for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:5201')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:800,height:1000},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/angles',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><div id="ground" style="width:800px;height:1000px"></div></body>'}));
await page.goto('http://127.0.0.1:5201/angles');
await page.evaluate(async()=>{
 const THREE=await import('/node_modules/three/build/three.module.js');
 const {GameScene}=await import('/src/scene/GameScene.ts');
 const s=window.labScene=new GameScene(document.querySelector('#ground'));s.render(0);
 s.world.children.forEach(o=>o.visible=o===s.batter.root);
 s.scene.children.forEach(o=>{if(o!==s.world&&!o.isLight)o.visible=false;});
 s.batter.root.position.set(0,0,0);
 s.scene.fog=null;s.scene.background=new THREE.Color(0xe9ece8);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0xe9ece8,roughness:1}));
 floor.rotation.x=-Math.PI/2;floor.position.y=-.015;floor.receiveShadow=true;s.scene.add(floor);
 window.angleCamera=new THREE.PerspectiveCamera(34,.8,.1,100);
});
await mkdir('test-results/batsman-angles',{recursive:true});
for(const [name,degrees] of [['front',0],['front-right',45],['right',90],['rear-right',135],['rear',180],['rear-left',225],['left',270],['front-left',315]]){
 const png=await page.evaluate(deg=>{const a=deg*Math.PI/180,s=window.labScene,c=window.angleCamera;c.position.set(Math.sin(a)*3.85,1.3,Math.cos(a)*3.85);c.lookAt(0,.88,0);s.renderer.render(s.scene,c);return s.renderer.domElement.toDataURL('image/png').split(',')[1];},degrees);
 await writeFile(`test-results/batsman-angles/${name}.png`,Buffer.from(png,'base64'));
}
await browser.close();server.kill();console.log(JSON.stringify({views:8,errors}));if(errors.length)process.exitCode=1;
