import * as pdfjs from './vendor/pdf.mjs';
import {makeLines,structureDocument} from './layout.js';
import {collectGraphics,reflowWithFigures} from './figures.js';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;

/** Parser adapter contract:
 * open(bytes,{onProgress}) -> {pages, reflow(options), renderPage(n,canvas),
 * renderRegion(n,box,canvas), destroy()}. Future OCR/layout providers implement
 * the same contract; source coordinates and original text remain available.
 * Never upload a document without a separate, explicit opt-in UI.
 */
export class PdfJsParser {
  async open(bytes,{onProgress=()=>{}}={}) {
    const task=pdfjs.getDocument({data:bytes,isEvalSupported:false,
      cMapUrl:new URL('./vendor/cmaps/',import.meta.url).href,cMapPacked:true,
      standardFontDataUrl:new URL('./vendor/standard_fonts/',import.meta.url).href,
      wasmUrl:new URL('./vendor/wasm/',import.meta.url).href});
    try {
      const pdf=await task.promise;
      const pages=[];
      for(let number=1;number<=pdf.numPages;number++) {
        const page=await pdf.getPage(number), viewport=page.getViewport({scale:1});
        const content=await page.getTextContent();
        const items=content.items.filter(i=>typeof i.str==='string').map(i=>{
          const tx=pdfjs.Util.transform(viewport.transform,i.transform);
          const font=content.styles[i.fontName];
          return {text:i.str,x:tx[4],y:tx[5],width:i.width,size:Math.hypot(tx[2],tx[3]),
            bold:/bold|black|heavy/i.test(i.fontName+' '+font?.fontFamily),
            math:/math|symbol|cmsy|cmmi|cmex/i.test(i.fontName+' '+font?.fontFamily)};
        });
        // Operator lists include raster images AND vector diagrams.
        let graphics=[];
        try {graphics=collectGraphics(await page.getOperatorList(),pdfjs.OPS,viewport);} catch { /* Caption fallback still displays the original page. */ }
        pages.push({number,width:viewport.width,height:viewport.height,lines:makeLines(items,viewport.width),graphics});
        onProgress(number,pdf.numPages);
      }
      const render=async(number,canvas,box)=>{
        const page=await pdf.getPage(number);
        const scale=1.7, viewport=page.getViewport({scale});
        const bounds=box||[0,0,viewport.width/scale,viewport.height/scale];
        canvas.width=Math.ceil((bounds[2]-bounds[0])*scale);
        canvas.height=Math.ceil((bounds[3]-bounds[1])*scale);
        await page.render({canvasContext:canvas.getContext('2d'),viewport,
          transform:[1,0,0,1,-bounds[0]*scale,-bounds[1]*scale],background:'#ffffff'}).promise;
      };
      return {pages,reflow:options=>reflowWithFigures(pages,structureDocument,options),
        renderPage:(n,c)=>render(n,c),renderRegion:(n,b,c)=>render(n,c,b),destroy:()=>pdf.destroy()};
    } catch(error) {await task.destroy(); throw error;}
  }
}
