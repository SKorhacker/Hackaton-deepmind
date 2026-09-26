// Integration regression: use an isolated browser profile; no saved player data is touched.
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

try {
 const p=await browser.newPage({viewport:{width:1000,height:760}});attach(p);
 await p.goto(base);await p.waitForFunction(()=>window.__game?.scene.isActive('menu'));
 await p.keyboard.press('Enter');await ready(p);
 check(await p.evaluate(()=>!localStorage.getItem('oneword_progress_v1')),'Fresh progress expected');
 await p.waitForFunction(()=>window.__audio?.ready);
 const decoded=await p.evaluate(async()=>{const a=window.__audio;return Promise.all([...a.buffers].map(async([name,buffer])=>({name,ok:!!(await buffer)})));});
 check(decoded.length===16&&decoded.every(b=>b.ok),'Audio decode failed '+JSON.stringify(decoded));
 results.push('All 16 audio files fetched and decoded');console.log(results.at(-1));
 await p.locator('#btn-sound').click();check(await p.evaluate(()=>window.__audio.muted),'Mute failed');await p.locator('#btn-sound').click();
 await word(p,'bounce');check(await p.locator('.wb-word').count()===0,'Word unlocked before completion');
 await p.locator('#btn-restart').click();await word(p,'hide');
 const kinds=[];
 for(let i=0;i<12;i++) {
  if(i!==0)await enter(p,i);
  if(i>0&&i<5)await word(p,['','sleep','help','key','help'][i]);
  if(i===5){await word(p,'sleep',0);await word(p,'guard',1);check(await p.evaluate(()=>{const r=window.__game.scene.getScene('game').rules;return r.tokenAt(0)==='CHASE'&&r.tokenAt(1)==='GUARD';}),'One-word limit did not restore previous slot');await p.locator('#btn-restart').click();}
  if(i>=8)await word(p,['slide','teleport','push','swap'][i-8]);
  if(i===7){await word(p,'hide');await word(p,'help',1);check(await p.evaluate(()=>window.__game.scene.getScene('game').rules.changedSlots.length===2),'Two-word exception failed');}
  if(i>0&&i<4)kinds.push(await p.evaluate(()=>[...window.__game.scene.getScene('game').guards.values()][0].sprite.texture.key));
  if(i===5||i===6){
   const script=i===5?'RRRD[word2:GUARD]RRRRD':'DDRD[word2:GUARD]RRRR[word2:YOU]RD[word3:BOUNCE]R[word1:FLEE].UUU';
   for(const token of script.match(/\[.*?\]|[URDL.]/g)) {
    const match=token.match(/\[word(\d+):(\w+)\]/);
    if(match)await word(p,match[2].toLowerCase(),Number(match[1])-1);
    else await move(p,{R:0,L:1,D:2,U:3,'.':4}[token]);
   }
  } else for(const a of await route(p))await move(p,a);
  await p.waitForFunction(()=>window.__game.scene.getScene('game').finished);
  check(await p.evaluate(i=>JSON.parse(localStorage.getItem('oneword_progress_v1')).includes(i+1),i),'Chapter progress missing');
  check(await p.evaluate(()=>window.__audio.currentMusic==='hope'),'Victory music missing');
  await p.locator('#complete').waitFor({state:'visible'});
  if(i===0){const words=await p.evaluate(()=>JSON.parse(localStorage.getItem('oneword_unlocked_words')));check(words.some(w=>w.word==='hide')&&!words.some(w=>w.word==='bounce'),'Completed attempt word unlock incorrect');}
  if(i===1||i===3)check((await p.locator('#complete').innerText()).includes(i===1?'Cartographer':'Archivist'),'Missing skin unlock');
  results.push(`Chapter ${i+1}: UI rewrite, movement, victory and persisted unlocks`);console.log(results.at(-1));
 }
 check(new Set(kinds).size===3,'Enemy designs not distinct: '+kinds);results.push('Three distinct enemy atlases across chapters 2–4');
 await enter(p,2);
 for(const [w,f] of [['sleep',1],['help',2],['freeze',3],['chase',0]]){await word(p,w);check(await p.evaluate(f=>[...window.__game.scene.getScene('game').guards.values()].every(v=>v.sprite.frame.name===f),f),`Missing enemy state ${w}`);}
 check(await p.locator('.wb-word[data-token="HELP"]').count()>0,'Usable word missing from chapter book');check(await p.locator('.wb-word[data-token="KEY"]').count()===0,'Unusable word shown in chapter book');
 await p.locator('.wb-word[data-token="HELP"]').first().click();check(await p.locator('#editor-input').inputValue()==='help','Word book did not prefill');await p.keyboard.press('Escape');
 await p.reload();await p.waitForFunction(()=>window.__game?.scene.isActive('menu'));check(await p.evaluate(()=>JSON.parse(localStorage.getItem('oneword_progress_v1')).length===12),'Progress did not survive reload');
 await p.keyboard.press('Enter');await ready(p);check(await p.locator('.wb-word[data-token="HIDE"]').count()>0,'Word list did not survive reload');
 results.push('Enemy states, chapter-filtered word book, click-to-reuse and reload persistence');
 await p.close();
 const m=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});attach(m);await m.goto(base);await m.locator('#rotate-screen').waitFor({state:'visible'});
 check(await m.locator('#app').evaluate(e=>e.inert),'Portrait game is not inert');
 await m.setViewportSize({width:844,height:390});await m.locator('#mobile-begin').waitFor({state:'visible'});
 check(await m.locator('.mobile-outfits button:disabled').count()===2,'Fresh mobile skins not locked');
 await m.locator('#mobile-begin').tap();await ready(m);await word(m,'hide');
 for(const a of await route(m))await move(m,a,true);await m.locator('#complete').waitFor({state:'visible'});
 await m.locator('#btn-next').tap();await ready(m);
 for(const size of [{width:844,height:390},{width:667,height:375}]){
  await m.setViewportSize(size);await m.waitForTimeout(300);
  check(await m.evaluate(()=>{const pad=document.getElementById('pad').getBoundingClientRect(),canvas=document.querySelector('canvas').getBoundingClientRect(),book=document.getElementById('wordbook').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth&&pad.bottom<=innerHeight+1&&canvas.bottom<=pad.top+1&&book.right<=innerWidth+1;}),'Mobile controls, board or book overflow '+JSON.stringify(size));
 }
 const turn=await m.evaluate(()=>window.__game.scene.getScene('game').world.s.turn);
 await m.setViewportSize({width:390,height:844});await m.locator('#rotate-screen').waitFor({state:'visible'});await m.keyboard.press('ArrowRight');await m.waitForTimeout(500);
 check(await m.evaluate(t=>window.__game.scene.getScene('game').world.s.turn===t,turn),'Portrait advanced game');
 await m.screenshot({path:'art/review/rotate-phone.png'});
 await m.setViewportSize({width:844,height:390});await m.waitForTimeout(250);await move(m,0,true);
 await m.screenshot({path:'art/review/merged-landscape.png'});results.push('Portrait pause, landscape recovery, touch-only victory, 844×390 and 667×375 layout');
 check(!errors.length,errors.join('\n'));console.log(JSON.stringify({results,errors},null,2));
} finally { await browser.close(); }
