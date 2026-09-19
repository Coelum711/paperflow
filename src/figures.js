// Drawn regions, not embedded-image objects: scientific diagrams are often
// vector paths plus labels. Rendering their source rectangle preserves both.
import {joinText} from './layout.js';
const identity=[1,0,0,1,0,0];
export function multiply(a,b) {
  return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
function transformBox(box,m) {
  const points=[[box[0],box[1]],[box[0],box[3]],[box[2],box[1]],[box[2],box[3]]].map(([x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);
  return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
}
const union=(a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])];
const touches=(a,b,gap=8)=>a[0]<=b[2]+gap&&b[0]<=a[2]+gap&&a[1]<=b[3]+gap&&b[1]<=a[3]+gap;

export function collectGraphics(ops,OPS,viewport) {
  let matrix=identity;const stack=[],regions=[];
  const add=(box,kind='vector')=>{
    if(!box)return;
    let b=transformBox(box,multiply(viewport.transform,matrix));
    b=[Math.max(0,b[0]),Math.max(0,b[1]),Math.min(viewport.width,b[2]),Math.min(viewport.height,b[3])];
    const w=b[2]-b[0],h=b[3]-b[1];
    if(!b.every(Number.isFinite)||w<0||h<0||(w<1&&h<1)||h>viewport.height*.85||w*h>viewport.width*viewport.height*.8)return;
    regions.push({box:b,kind});
  };
  for(let i=0;i<ops.fnArray.length;i++) {
    const op=ops.fnArray[i],args=ops.argsArray[i]||[];
    if(op===OPS.save)stack.push(matrix);
    else if(op===OPS.restore)matrix=stack.pop()||identity;
    else if(op===OPS.transform)matrix=multiply(matrix,args);
    else if(op===OPS.paintFormXObjectBegin) {stack.push(matrix);if(args[0])matrix=multiply(matrix,args[0]);add(args[1],'group');}
    else if(op===OPS.paintFormXObjectEnd)matrix=stack.pop()||identity;
    else if(op===OPS.beginGroup) {
      // PDF.js applies a group's matrix to its clip, not to child coordinates.
      add(args[0].matrix?transformBox(args[0].bbox,args[0].matrix):args[0].bbox,'group');
    }
    else if(op===OPS.constructPath && args[0]!==OPS.endPath)add(args[2]);
    else if([OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintImageMaskXObject].includes(op))add([0,0,1,1],'raster');
  }
  // Union touching primitives so arrows, vector shapes and image tiles remain
  // one illustration. Full-page backgrounds were excluded above.
  const clusters=[];
  for(const region of regions) {
    let box=region.box,kind=region.kind,changed=true;
    while(changed) {
      changed=false;
      for(let i=clusters.length-1;i>=0;i--)if(touches(box,clusters[i].box)) {
        box=union(box,clusters[i].box);if(clusters[i].kind==='raster')kind='raster';clusters.splice(i,1);changed=true;
      }
    }
    clusters.push({box,kind});
  }
  return clusters.filter(r=>r.box[2]-r.box[0]>35&&r.box[3]-r.box[1]>20);
}

export function locateFigures(page) {
  const captions=page.lines.filter(l=>/^(figure|fig\.|图)\s*\d+\s*[:：.]/i.test(l.text));
  return captions.map(caption=>{
    const captionLines=[caption];let previous=caption;
    for(const line of page.lines.filter(l=>l.y>caption.y+2).sort((a,b)=>a.y-b.y)) {
      if(line.y-previous.y>caption.size*1.65)break;
      if(Math.abs(line.x-caption.x)>caption.size || line.x+line.width>caption.x+caption.width+8)continue;
      if(Math.abs(line.size-caption.size)>.2 || captions.includes(line))break;
      captionLines.push(line);previous=line;
    }
    const candidates=(page.graphics||[]).filter(({box:b})=>{
      const overlap=Math.min(caption.x+caption.width,b[2])-Math.max(caption.x,b[0]);
      return overlap>Math.min(caption.width,b[2]-b[0])*.35 && b[3]<=caption.y+3 && caption.y-b[3]<100;
    }).sort((a,b)=>(caption.y-a.box[3])-(caption.y-b.box[3]));
    const nearest=candidates[0];
    if(!nearest)return {caption,captionLines,box:[0,0,page.width,page.height],fallback:true};
    let box=[...nearest.box];
    // Preserve adjacent panels when they share a vertical band.
    for(const candidate of candidates.slice(1))if(Math.min(box[3],candidate.box[3])-Math.max(box[1],candidate.box[1])>20)box=union(box,candidate.box);
    // Axis ticks and titles are text, often outside the path's bounding box.
    const graphicBox=[...box];
    for(const line of page.lines) {
      if(line===caption||line.text.length>55)continue;
      if(line.x>=graphicBox[0]-40&&line.x+line.width<=graphicBox[2]+40&&line.y>=graphicBox[1]-18&&line.y<caption.y-caption.size-2) {
        box=union(box,[line.x,line.y-line.size,line.x+line.width,line.y+line.size*.3]);
      }
    }
    box=[Math.max(0,box[0]-5),Math.max(0,box[1]-6),Math.min(page.width,box[2]+5),Math.min(caption.y-caption.size-2,box[3]+6)];
    return {caption,captionLines,box,fallback:false};
  });
}

export function reflowWithFigures(pages,structure,options) {
  const figures=pages.flatMap(page=>locateFigures(page).map(figure=>({...figure,page:page.number})));
  const words=new Set(pages.flatMap(p=>p.lines.flatMap(l=>l.text.toLowerCase().match(/[\p{L}]{3,}/gu)||[])));
  const cleaned=pages.map(page=>({...page,lines:page.lines.filter(line=>!figures.some(f=>{
    if(f.page!==page.number)return false;
    if(f.captionLines.slice(1).includes(line))return true;
    if(f.fallback)return false;
    return line.x>=f.box[0]-2&&line.x+line.width<=f.box[2]+2&&line.y-line.size>=f.box[1]-3&&line.y<=f.box[3]+2;
  })).map(line=>{
    const figure=figures.find(f=>f.page===page.number&&f.caption===line);
    return figure?{...line,text:figure.captionLines.map(l=>l.text).reduce((a,b)=>joinText(a,b,words))}:line;
  })}));
  const result=structure(cleaned,options);
  result.blocks=result.blocks.map(block=>{
    const figure=figures.find(f=>f.page===block.page&&block.type==='caption'&&Math.abs(block.box[1]-(f.caption.y-f.caption.size))<1&&Math.abs(block.box[0]-f.caption.x)<1);
    return figure?{...block,type:'figure',box:figure.box,figureFallback:figure.fallback}:block;
  });
  return result;
}
