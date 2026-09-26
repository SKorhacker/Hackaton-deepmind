import { readFile, writeFile } from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const b=await chromium.launch();
try {
 const page=await b.newPage();
 const data=(await readFile('art/runtime/sentinel-states-source.png')).toString('base64');
 const out=await page.evaluate(async data=>{
  const im=new Image();im.src='data:image/png;base64,'+data;await im.decode();
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=512;
  const out=canvas.getContext('2d');out.imageSmoothingQuality='high';
  for(let i=0;i<4;i++){
   const part=document.createElement('canvas');part.width=Math.floor(im.width/2);part.height=Math.floor(im.height/2);
   const ctx=part.getContext('2d');ctx.drawImage(im,(i%2)*part.width,Math.floor(i/2)*part.height,part.width,part.height,0,0,part.width,part.height);
   const rgba=ctx.getImageData(0,0,part.width,part.height).data;
   let x1=part.width,y1=part.height,x2=0,y2=0,clear=0;
   for(let j=3;j<rgba.length;j+=4){if(rgba[j]===0)clear++;if(rgba[j]<30)continue;const p=(j-3)/4,x=p%part.width,y=Math.floor(p/part.width);x1=Math.min(x1,x);x2=Math.max(x2,x);y1=Math.min(y1,y);y2=Math.max(y2,y);}
   if(clear<1000)throw Error('Expected real transparency');
   const w=x2-x1+1,h=y2-y1+1,scale=Math.min(440/w,456/h);
   out.drawImage(part,x1,y1,w,h,i*512+(512-w*scale)/2,486-h*scale,w*scale,h*scale);
  }
  return canvas.toDataURL('image/png').split(',')[1];
 },data);
 await writeFile('one-word/public/art/runtime/sentinel-states.png',Buffer.from(out,'base64'));
 console.log('Four alpha-preserving 512px frames, registered at foot y=486.');
}finally{await b.close();}
