import {readFile,writeFile} from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {makeLines,structureDocument} from '../src/layout.js';
const path=process.argv[2];
if(!path)throw Error('Usage: npm run check:pdf -- /path/to/paper.pdf [result.json]');
const pdf=await pdfjs.getDocument({data:new Uint8Array(await readFile(path)),isEvalSupported:false}).promise;
const pages=[];
for(let n=1;n<=pdf.numPages;n++) {
  const page=await pdf.getPage(n),view=page.getViewport({scale:1}),content=await page.getTextContent();
  const items=content.items.filter(i=>typeof i.str==='string').map(i=>{const tx=pdfjs.Util.transform(view.transform,i.transform);return{text:i.str,x:tx[4],y:tx[5],width:i.width,size:Math.hypot(tx[2],tx[3]),bold:/bold/i.test(content.styles[i.fontName]?.fontFamily||'')};});
  pages.push({number:n,width:view.width,height:view.height,lines:makeLines(items,view.width)});
}
const result=structureDocument(pages);
console.log(JSON.stringify({pages:pages.length,blocks:result.blocks.length,removed:result.removed,warnings:result.warnings,headings:result.blocks.filter(b=>b.type==='heading').map(b=>b.text),firstBlocks:result.blocks.slice(0,12)},null,2));
if(process.argv[3])await writeFile(process.argv[3],JSON.stringify({pages,result},null,2));
await pdf.destroy();
