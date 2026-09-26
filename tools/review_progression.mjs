const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch();
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const errors=[];
try {
 const p=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:5173/');await p.locator('#mobile-begin').waitFor({state:'visible'});
 assert(await p.locator('.mobile-chapters button').count()===12,'Mobile chapter list incomplete');
 assert(await p.locator('.mobile-outfits button:disabled').count()===2,'Locked outfits selectable');
 await p.screenshot({path:'art/review/merged-mobile-menu.png'});
 await p.evaluate(()=>localStorage.setItem('oneword_progress_v1','[2]'));await p.reload();await p.locator('#mobile-begin').waitFor({state:'visible'});
 assert(await p.locator('.mobile-outfits button:disabled').count()===1,'Chapter 2 outfit unlock incorrect');
 await p.getByRole('button',{name:'Cartographer',exact:true}).tap();await p.locator('#mobile-begin').tap();await p.waitForFunction(()=>window.__game?.scene.isActive('game'));
 assert(await p.evaluate(()=>window.__game.scene.getScene('game').playerSprite.texture.key==='hero-cartographer'),'Selected outfit not rendered');
 await p.evaluate(()=>localStorage.setItem('oneword_progress_v1','[2,4]'));await p.reload();await p.locator('#mobile-begin').waitFor({state:'visible'});
 assert(await p.locator('.mobile-outfits button:disabled').count()===0,'Chapter 4 outfit unlock incorrect');
 assert(await p.getByRole('button',{name:'Cartographer',exact:true}).getAttribute('aria-pressed')==='true','Outfit selection not saved');
 await p.getByRole('button',{name:'Archivist',exact:true}).tap();
 await p.waitForFunction(()=>window.__audio.bed?.name==='menu');
 await p.locator('#mobile-begin').tap();await p.waitForFunction(()=>window.__game?.scene.isActive('game'));await p.waitForFunction(()=>window.__audio.bed?.name==='calm');
 for(const [i,name] of [[1,'sentinel'],[2,'owl'],[3,'wraith']]) {
  await p.evaluate(i=>window.__game.scene.getScene('game').scene.restart({levelIndex:i}),i);await p.waitForTimeout(500);
  assert(await p.evaluate(name=>[...window.__game.scene.getScene('game').guards.values()][0].sprite.texture.key===name+'-states',name),'Enemy atlas mismatch');
  if(i===1)await p.waitForFunction(()=>window.__audio.bed?.name==='tension');
  if(i===2){await p.locator('.word.editable').first().tap();await p.locator('#editor-input').fill('sleep');await p.locator('#editor-apply').tap();await p.waitForFunction(()=>window.__audio.bed?.name==='mystery');}
  await p.screenshot({path:`art/review/enemy-${name}-mobile.png`});
 }
 await p.evaluate(()=>window.__game.scene.getScene('game').scene.restart({levelIndex:6}));await p.waitForTimeout(500);await p.setViewportSize({width:667,height:375});await p.waitForTimeout(300);
 assert(await p.evaluate(()=>{const a=document.querySelector('canvas').getBoundingClientRect(),b=document.getElementById('pad').getBoundingClientRect();return a.height>100&&a.bottom<=b.top+1&&document.documentElement.scrollWidth<=innerWidth;}),'Three-rule mobile chapter overflow');
 await p.screenshot({path:'art/review/merged-mobile-three-rules.png'});
 assert(!errors.length,errors.join('\n'));console.log('PASS: 12 mobile chapters; skin locks, selection and persistence; menu/calm/tension/mystery playback; all three enemy designs; 667×375 three-rule layout. No browser errors.');
} finally {await browser.close();}
