import {access, unlink} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch();
const errors=[], results=[];
const base='http://127.0.0.1:5173/';
const check=(ok,msg)=>{if(!ok)throw Error(msg);};
const attach=p=>p.on('pageerror',e=>{ errors.push(e.message); console.log('PAGE ERROR:',e.message); });
async function ready(p){await p.waitForFunction(()=>window.__game?.scene.isActive('game'));await p.waitForTimeout(300);}
async function enter(p,i){await p.evaluate(i=>{const g=window.__game;if(g.scene.isActive('game'))g.scene.getScene('game').scene.restart({levelIndex:i});else g.scene.start('game',{levelIndex:i});},i);await ready(p);}
async function word(p,text,slot=0){await p.locator('.word.editable').nth(slot).click();await p.locator('#editor-input').fill(text);await p.locator('#editor-apply').click();await p.waitForFunction(()=>document.getElementById('editor').hidden);await p.waitForTimeout(350);}
async function route(p){return p.evaluate(()=>{const s=window.__game.scene.getScene('game'),acts=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},null];const q=[{w:s.world.clone(),p:[]}],seen=new Set([q[0].w.key()]);for(let h=0;h<q.length&&h<200000;h++){for(let a=0;a<acts.length;a++){const w=q[h].w.clone();if(!w.step(acts[a]).length||w.s.dead)continue;const p=[...q[h].p,a];if(w.s.won)return p;if(seen.has(w.key()))continue;seen.add(w.key());q.push({w,p});}}throw Error('No route');});}
async function move(p,a,touch=false){await p.waitForFunction(()=>!window.__game.scene.getScene('game').locked);const before=await p.evaluate(()=>window.__game.scene.getScene('game').world.s.turn);if(touch)await p.locator(`[data-dir="${['right','left','down','up','wait'][a]}"]`).tap();else await p.keyboard.press(['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Space'][a]);await p.waitForFunction(n=>{const s=window.__game.scene.getScene('game').world.s;return s.turn>n||s.won||s.dead;},before);}
const temp='one-word/src/levels/definitions/997-art-compatibility-check.ts';let created=false;
try{
 const p=await browser.newPage({viewport:{width:1000,height:760}});attach(p);await p.goto(base);await p.waitForFunction(()=>window.__game?.scene.isActive('menu'));await p.keyboard.press('Enter');await ready(p);
 // Defeat stays on the grid and reset/restart cancels outstanding outcome timers.
 for(let i=0;i<3;i++)await move(p,0);
 await p.waitForFunction(()=>!!window.__game.scene.getScene('game').outcomeFx);
 const death=await p.evaluate(()=>{const s=window.__game.scene.getScene('game');return {dead:s.world.s.dead,scale:s.player.scaleX,angle:s.player.angle,flash:s.cameras.main.flashEffect.isRunning};});check(death.dead&&death.scale===1&&death.angle===0&&!death.flash,'Death presentation regression');
 await p.screenshot({path:'art/review/storybook-defeat.png'});await p.locator('#btn-restart').click();await move(p,0);await p.waitForTimeout(1500);check(await p.evaluate(()=>window.__game.scene.getScene('game').world.s.player.x===3),'Stale death reset interrupted restart');
 for(let i=0;i<6;i++){
  await enter(p,i);await word(p,['bounce','sleep','help','key','help','hide'][i]);if(i===5)await word(p,'help',1);
  const path=await route(p);for(const a of path)await move(p,a);
  await p.waitForFunction(()=>!!window.__game.scene.getScene('game').outcomeFx);
  if(i===0)await p.screenshot({path:'art/review/storybook-victory-effect.png'});
  await p.locator('#complete').waitFor({state:'visible'}).catch(async e => { console.log(await p.evaluate(()=>{const s=window.__game.scene.getScene('game'); return {state:s.world.s,finished:s.finished,time:s.time.now,timer:s.outcomeTimer?.getProgress(),pending:s.time.getAllEvents().length,errors:window.__errors};})); throw e; });
  check(await p.evaluate(()=>{const s=window.__game.scene.getScene('game');return s.world.s.won&&s.player.scaleX===1&&s.player.scaleY===1;}),'Victory or movement scale mismatch');
  if(i===5){check((await p.locator('#complete-rule').innerText()).includes('HELP'),'Multiword completion missing');await p.screenshot({path:'art/review/storybook-victory.png'});}
  results.push(`Chapter ${i+1}: won via rule editor and keyboard`); console.log(results.at(-1));
 }
 await enter(p,2);
 for(const [w,f] of [['sleep',1],['help',2],['freeze',3],['chase',0]]){await word(p,w);check(await p.evaluate(f=>[...window.__game.scene.getScene('game').guards.values()].every(v=>v.sprite.frame.name===f),f),`Missing sentinel state ${w}`);}
 results.push('All four sentinel states');
 // Mobile portrait, rotated viewport, keyboard sheet, touch-only victory.
 const m=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});attach(m);await m.goto(base);await m.waitForFunction(()=>window.__game?.scene.isActive('menu'));await m.locator('#mobile-begin').tap();await ready(m);
 const square=await m.evaluate(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return Math.abs(r.width/c.width-r.height/c.height)<.002;});check(square,'Mobile canvas aspect ratio distorted');
 await m.locator('.word.editable').first().tap();check(await m.locator('#editor').evaluate(e=>e.classList.contains('sheet')),'Missing keyboard sheet');await m.locator('#editor-input').fill('hide');await m.locator('#editor-apply').tap();await m.waitForTimeout(400);
 for(const a of await route(m))await move(m,a,true);await m.locator('#complete').waitFor({state:'visible'});await m.screenshot({path:'art/review/mobile-victory.png'});
 await m.locator('#btn-next').tap();await ready(m);await m.setViewportSize({width:844,height:390});await m.waitForTimeout(500);
 const overlap=await m.evaluate(()=>{const p=document.getElementById('pad').getBoundingClientRect(),c=document.querySelector('canvas').getBoundingClientRect();return {pad:p.bottom<=innerHeight,clear:c.bottom<=p.top+1,overflow:document.documentElement.scrollWidth>innerWidth};});check(overlap.pad&&overlap.clear&&!overlap.overflow,'Landscape controls overlap or overflow '+JSON.stringify(overlap));await m.screenshot({path:'art/review/mobile-landscape.png'});
 await m.setViewportSize({width:320,height:568});await m.waitForTimeout(400);check(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'320px horizontal overflow');await m.screenshot({path:'art/review/mobile-small.png'});results.push('Touch-only victory, keyboard sheet, 390px portrait / 844px landscape / 320px layout');
 // Level maker: paint with touch, test, save, and launch a wider custom map.
 try{await access(temp);throw Error('Test destination already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
 const ed=await browser.newPage({viewport:{width:1280,height:900}});attach(ed);await ed.goto(base+'editor.html');await ed.locator('.grid .cell').first().waitFor();
 await ed.locator('input[type=text]').fill('ART COMPATIBILITY CHECK');await ed.locator('input[type=number]').fill('997');
 for(let i=0;i<8;i++)await ed.getByRole('button',{name:'+ wide',exact:true}).click();
 await ed.getByRole('button',{name:'GUARD',exact:true}).click();await ed.locator('.cell[title="3,2"]').click();check(await ed.locator('.cell[title="3,2"] .tile-art').evaluate(e=>e.style.backgroundImage.includes('sentinel-states')),'Maker guard art missing');
 await ed.getByRole('button',{name:'FLOOR',exact:true}).click();await ed.locator('.cell[title="3,2"]').click();
 await ed.getByRole('button',{name:'RED',exact:true}).click();for(let y=1;y<=5;y++)await ed.locator(`.cell[title="4,${y}"]`).click();
 await ed.getByRole('button',{name:'TEST LEVEL',exact:true}).click();await ed.locator('.status.ok').waitFor();
 await ed.screenshot({path:'art/review/storybook-level-maker.png'});
 created=true;await ed.getByRole('button',{name:'SAVE TO definitions/',exact:true}).click();await ed.getByRole('link',{name:'PLAY LEVEL 997 →'}).waitFor();await ed.getByRole('link',{name:'PLAY LEVEL 997 →'}).click();await ready(ed);check(await ed.evaluate(()=>window.__game.scene.getScene('game').level.id===997),'Maker play link did not load custom level');
 check(await ed.evaluate(()=>{const s=window.__game.scene.getScene('game'),c=s.cameras.main,vw=c.width/c.zoom;return vw>=s.level.width*56+16;}),'Large custom map cropped');
 await word(ed,'hide');for(const a of await route(ed))await move(ed,a);await ed.locator('#complete').waitFor({state:'visible'});results.push('Maker painted, solver-tested, saved, launched and won a 21-column custom level');
 await m.goto(base+'editor.html');await m.getByRole('button',{name:'GUARD',exact:true}).tap();await m.locator('.cell[title="3,2"]').tap();check(await m.locator('.cell[title="3,2"]').getAttribute('aria-label')==='GUARD at 3, 2','Touch painting failed');check(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Maker page overflows phone');results.push('Level maker touch painting and phone layout');
 await p.emulateMedia({reducedMotion:'reduce'});await p.goto(base);await p.waitForFunction(()=>window.__game?.scene.isActive('menu'));await p.keyboard.press('Enter');await ready(p);for(let i=0;i<3;i++)await move(p,0);await p.waitForFunction(()=>!!window.__game.scene.getScene('game').outcomeFx);check(await p.evaluate(()=>window.__game.scene.getScene('game').outcomeFx.length===4),'Reduced motion emits moving particles');results.push('Reduced motion outcome');
 check(!errors.length,errors.join('\n'));console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();if(created)await unlink(temp).catch(()=>{});}
