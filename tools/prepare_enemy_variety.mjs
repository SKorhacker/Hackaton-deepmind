import {readFile,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const b=await chromium.launch();
try {const page=await b.newPage();const src=(await readFile('art/runtime/enemy-variety-source.png')).toString('base64');
const result=await page.evaluate(async src=>{
 const im=new Image();im.src='data:image/png;base64,'+src;await im.decode();const outputs=[];
 for(let row=0;row<2;row++){
  const frames=[];
  for(let col=0;col<4;col++){
   const c=document.createElement('canvas');c.width=Math.floor(im.width/4);c.height=Math.floor(im.height/2);const x=c.getContext('2d');x.drawImage(im,col*c.width,row*c.height,c.width,c.height,0,0,c.width,c.height);
   const d=x.getImageData(0,0,c.width,c.height).data;let l=c.width,t=c.height,r=0,b=0,clear=0;
   for(let i=3;i<d.length;i+=4){if(!d[i])clear++;if(d[i]<30)continue;const p=(i-3)/4,xx=p%c.width,yy=Math.floor(p/c.width);l=Math.min(l,xx);r=Math.max(r,xx);t=Math.min(t,yy);b=Math.max(b,yy);}
   if(clear<1000)throw Error('Missing alpha');frames.push({c,l,t,w:r-l+1,h:b-t+1});
  }
  const scale=Math.min(440/Math.max(...frames.map(f=>f.w)),456/Math.max(...frames.map(f=>f.h)));
  const out=document.createElement('canvas');out.width=2048;out.height=512;const x=out.getContext('2d');x.imageSmoothingQuality='high';
  frames.forEach((f,i)=>x.drawImage(f.c,f.l,f.t,f.w,f.h,i*512+(512-f.w*scale)/2,486-f.h*scale,f.w*scale,f.h*scale));outputs.push(out.toDataURL('image/png').split(',')[1]);
 }return outputs;
},src);
for(const [i,name] of ['owl','wraith'].entries())await writeFile(`one-word/public/art/runtime/${name}-states.png`,Buffer.from(result[i],'base64'));
console.log('Exported owl and wraith: 4 registered transparent 512px frames each.');
}finally{await b.close();}
