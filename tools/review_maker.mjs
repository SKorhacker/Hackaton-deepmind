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
 const p=await browser.newPage({viewport:{width:1000,height:760}});attach(p); const m=await browser.newPage({viewport:{width:320,height:568},isMobile:true,hasTouch:true});attach(m);
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
