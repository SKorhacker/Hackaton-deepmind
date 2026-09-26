// Exact-palette vector skin. No generated raster repainting, external fonts or API keys.
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dest = 'art/delivery/one-word-terminal-skin-v1';
await mkdir(`${dest}/sources`, { recursive: true });
const P = { bg:'#14121c', floor:'#221f2e', floor_alt:'#262335', wall:'#3b3552', wall_top:'#4d4669', red:'#e5484d', red_dark:'#a8323a', exit:'#5ee6a0', plate:'#e0b94f', plate_down:'#9c7f2e', door:'#8b5cf6', key:'#ffd166', player:'#f4f1ea', hidden:'#8f8aa3', guard:'#ff8c42', ice:'#9fdcff' };
const rect=(x,y,w,h,fill,rx=0,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
const svg=(body,w=112,h=112)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const floor=(alt=false)=>rect(2,2,108,108,alt?P.floor_alt:P.floor,3)+`<path d="M4 108V4H108" fill="none" stroke="${alt?P.wall:P.wall_top}" stroke-opacity=".15" stroke-width="2"/>`+(alt?`<g fill="${P.wall_top}" opacity=".25"><rect x="23" y="31" width="2" height="2"/><rect x="83" y="77" width="2" height="2"/><rect x="58" y="18" width="2" height="2"/></g>`:'');
const player=(hidden=false,frame=0)=>{
  const stretch=[1,1.018,1,.985][frame], eye=[16,15,14,16][frame];
  return `<g opacity="${hidden?.45:1}" transform="translate(0 ${92*(1-stretch)}) scale(1 ${stretch})">`+rect(20,20,72,72,hidden?P.hidden:P.player,18)+
    (hidden?`<rect x="16" y="16" width="80" height="80" rx="22" fill="none" stroke="${P.hidden}" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round"/>`:'')+
    rect(37,44+(16-eye)/2,10,eye,P.bg,3)+rect(65,44+(16-eye)/2,10,eye,P.bg,3)+'</g>';
};
const guard=(asleep=false,frame=0)=>{
  const stretch=[1,1.016,1,.986][frame], eye=asleep?4:[14,13,12,14][frame];
  return `<g transform="translate(0 ${96*(1-stretch)}) scale(1 ${stretch})"><path d="M30 16H82L98 32V84L86 96H26L14 84V32Z" fill="${P.guard}"/>`+
    (asleep?`<defs><radialGradient id="sleep"><stop stop-color="${P.key}" stop-opacity=".5"/><stop offset="1" stop-color="${P.guard}" stop-opacity="0"/></radialGradient></defs><ellipse cx="56" cy="55" rx="32" ry="24" fill="url(#sleep)"/>`:'')+
    rect(31,49+(14-eye)/2,50,eye,P.bg,asleep?2:4)+'</g>';
};
const exit=`<defs><radialGradient id="portal"><stop stop-color="${P.exit}" stop-opacity=".35"/><stop offset="1" stop-color="${P.exit}" stop-opacity=".08"/></radialGradient></defs>`+rect(4,4,104,104,'url(#portal)',10,`stroke="${P.exit}" stroke-width="2" stroke-opacity=".8"`)+`<rect x="27" y="27" width="58" height="58" rx="19" fill="none" stroke="${P.exit}" stroke-width="3"/><path d="M39 56H74M62 44L74 56L62 68" fill="none" stroke="${P.exit}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
const red=`<defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="16" height="16"><path d="M-4 4L4-4M0 16L16 0M12 20L20 12" stroke="${P.red_dark}" stroke-opacity=".28" stroke-width="2"/></pattern></defs>`+rect(3,3,106,106,P.red_dark,8)+rect(7,7,98,98,P.red,5)+rect(7,7,98,98,'url(#hatch)',5)+`<path d="M11 10H101" stroke="${P.player}" stroke-opacity=".12" stroke-width="4"/>`;
const plate=down=>floor()+`<circle cx="56" cy="56" r="37" fill="${P.bg}"/><circle cx="56" cy="${down?56:52}" r="32" fill="${down?P.plate_down:P.plate}"/><circle cx="56" cy="${down?56:52}" r="25" fill="none" stroke="${down?P.plate:P.bg}" stroke-opacity="${down?.35:.18}" stroke-width="2"/>`+(down?'':`<path d="M33 31Q56 11 79 31" fill="none" stroke="${P.player}" stroke-width="4" stroke-opacity=".2"/>`);
const assets={
  floor:floor(), floor_alt:floor(true),
  wall:rect(2,2,108,108,P.wall,3)+`<path d="M2 5Q2 2 5 2H107Q110 2 110 5V17H2Z" fill="${P.wall_top}"/><path d="M4 108H108V17" fill="none" stroke="${P.bg}" stroke-opacity=".28" stroke-width="4"/>`,
  red, exit, plate_up:plate(false), plate_down:plate(true),
  door:rect(7,4,98,104,P.door,6)+`<path d="M12 8H100" stroke="${P.player}" stroke-opacity=".2" stroke-width="4"/><path d="M39 14V101M73 14V101" stroke="${P.bg}" stroke-opacity=".45" stroke-width="4"/>`,
  key:`<g transform="rotate(-38 56 56)"><circle cx="50" cy="31" r="16" fill="none" stroke="${P.key}" stroke-width="9"/>`+rect(45.5,45,9,48,P.key,2)+rect(51,70,19,8,P.key,1)+rect(51,84,15,8,P.key,1)+'</g>',
  player:player(), player_hidden:player(true), guard:guard(), guard_asleep:guard(true),
  ice:rect(5,5,102,102,P.ice,8,'fill-opacity=".2"')+`<path d="M56 20L85 37V73L56 91L27 73V37Z" fill="${P.ice}" fill-opacity=".25" stroke="${P.ice}" stroke-width="2"/><path d="M56 28V84M32 42L80 70M32 70L80 42M49 32L56 39L63 32M49 80L56 73L63 80M36 41L39 50L30 52M82 60L73 62L76 71M30 60L39 62L36 71M76 41L73 50L82 52" fill="none" stroke="${P.ice}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
};
const files=Object.entries(assets).map(([name,body])=>({name,svg:svg(body),width:112,height:112}));
for (const [name,draw] of [['player',player],['guard',guard]]) files.push({name:`${name}_idle`,svg:svg(Array.from({length:4},(_,i)=>`<g transform="translate(${112*i} 0)">${draw(false,i)}</g>`).join(''),448,112),width:448,height:112});
const cover=rect(0,0,630,500,'#151122')+`
<defs><clipPath id="glitch-a"><rect x="252" y="149" width="320" height="5"/><rect x="252" y="174" width="320" height="6"/></clipPath><clipPath id="glitch-b"><rect x="252" y="160" width="320" height="3"/><rect x="252" y="192" width="320" height="3"/></clipPath></defs>
<g transform="translate(62 0)"><g font-family="monospace" font-size="61" font-weight="700"><text x="75" y="194" fill="${P.player}">ONE</text><text x="245" y="194" fill="${P.key}">WORD</text><g clip-path="url(#glitch-a)"><text x="250" y="194" fill="${P.ice}">WORLD</text><text x="243" y="192" fill="${P.red}" opacity=".8">WORLD</text><text x="247" y="194" fill="${P.key}">WORLD</text></g><g clip-path="url(#glitch-b)"><text x="239" y="194" fill="${P.player}">WORLD</text></g></g>
<path d="M246 141H261M464 197H496M383 148H398" stroke="${P.key}" stroke-width="2" opacity=".65"/></g>
<g transform="translate(166 292) scale(.72)">${floor()}<g transform="translate(150 0)">${red}</g><g transform="translate(300 0)">${exit}</g>${player()}</g>
<path d="M254 332H260M265 332H271M362 332H368M373 332H379" stroke="${P.wall_top}" stroke-width="2"/>
`;
files.push({name:'itch_cover',svg:svg(cover,630,500),width:630,height:500});
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage();
  const manifest=[];
  for (const item of files) {
    await writeFile(`${dest}/sources/${item.name}.svg`, item.svg);
    const result=await page.evaluate(async item=>{
      const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(item.svg);await image.decode();
      const c=document.createElement('canvas');c.width=item.width;c.height=item.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
      const data=ctx.getImageData(0,0,c.width,c.height).data;
      let opaque=0,transparent=0,maxAlpha=0;
      for(let i=3;i<data.length;i+=4){if(data[i]===0)transparent++;if(data[i]===255)opaque++;maxAlpha=Math.max(maxAlpha,data[i]);}
      if(item.name!=='itch_cover'&&(!transparent||data[3]!==0))throw new Error('Transparency missing: '+item.name);
      if(item.name==='player_hidden'&&maxAlpha>116)throw new Error('Hidden character is too opaque');
      return{data:c.toDataURL('image/png').split(',')[1],opaque,transparent,maxAlpha};
    },item);
    await writeFile(`${dest}/${item.name}.png`,Buffer.from(result.data,'base64'));
    manifest.push({file:`${item.name}.png`,width:item.width,height:item.height,transparentPixels:result.transparent,maxAlpha:result.maxAlpha,...(item.name.endsWith('_idle')?{frames:4,frameWidth:112,frameHeight:112,frameRate:4}: {})});
  }
  await writeFile(`${dest}/manifest.json`,JSON.stringify({name:'ONE WORD — Terminal skin',version:1,palette:P,logicalTile:56,scale:2,anchor:[.5,.5],items:manifest},null,2));
  // Review at native delivery size AND the actual 56px game size.
  const preview=`<!doctype html><style>body{margin:0;background:#14121c;color:#f4f1ea;font:12px monospace;padding:28px}main{display:grid;grid-template-columns:repeat(7,140px);gap:16px}.card{padding:12px;background:#1d1a29;border:1px solid #34304a;text-align:center}.stage{background:repeating-conic-gradient(#262335 0 25%,#221f2e 0 50%) 0/16px 16px;margin-bottom:10px}img{vertical-align:middle}label{display:block;margin:10px 0 0;color:#b9b4cc}.small{margin-top:10px}h1{font-size:18px;margin:0 0 24px}</style><h1>ONE WORD / TERMINAL SKIN — 112px masters + 56px in-game scale</h1><main>${files.filter(f=>f.width===112).map(f=>`<div class="card"><div class="stage"><img width="112" height="112" src="data:image/svg+xml;base64,${Buffer.from(f.svg).toString('base64')}"></div><img class="small" width="56" height="56" src="data:image/svg+xml;base64,${Buffer.from(f.svg).toString('base64')}"><label>${f.name}.png</label></div>`).join('')}</main>`;
  await page.setViewportSize({width:1164,height:640});await page.setContent(preview);await page.screenshot({path:'art/delivery/terminal-skin-preview.png',fullPage:true});
  console.log(`Exported and alpha-checked ${files.length} PNG files.`);
} finally {await browser.close();}
