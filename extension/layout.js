// Pure, replaceable layout engine. All coordinates use PDF.js viewport units.
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)] || 10;
const end = l => l.x + l.width;
const clean = text => text.replace(/[ﬀﬁﬂﬃﬄ]/g, c => ({'ﬀ':'ff','ﬁ':'fi','ﬂ':'fl','ﬃ':'ffi','ﬄ':'ffl'}[c])).replace(/\s+/g, ' ').trim();

export function makeLines(items, pageWidth=0) {
  const rows = [];
  for (const item of [...items].filter(i => i.text.trim()).sort((a,b)=>a.y-b.y || a.x-b.x)) {
    let row = rows.slice(-4).find(r => Math.abs(r.y-item.y) < Math.max(2, Math.min(r.size,item.size)*.28));
    if (!row) {row = {y:item.y, size:item.size, items:[]}; rows.push(row);}
    row.items.push(item);
  }
  const lines = [];
  for (const row of rows) {
    let part = [];
    const flush = () => {
      if (!part.length) return;
      let text = '', previous;
      for (const item of part) {
        const gap = previous ? item.x-previous.x-previous.width : 0;
        text += (previous && gap > Math.min(previous.size,item.size)*.15 && !text.endsWith(' ') ? ' ' : '') + item.text;
        previous = item;
      }
      lines.push({text:clean(text), x:part[0].x, y:row.y, width:Math.max(...part.map(i=>i.x+i.width))-part[0].x,
        size:median(part.map(i=>i.size)), bold:part.some(i=>i.bold), math:part.some(i=>i.math)});
      part = [];
    };
    for (const item of row.items.sort((a,b)=>a.x-b.x)) {
      const last = part.at(-1);
      const gap=last ? item.x-last.x-last.width : 0;
      // ACL's gutter can be only 17pt; never join body text across that gap.
      const nearGutter=last && pageWidth && last.x+last.width<pageWidth/2 && item.x>pageWidth/2;
      if (last && gap > (nearGutter ? Math.max(7,row.size*.7) : Math.max(16,row.size*1.9))) flush();
      part.push(item);
    }
    flush();
  }
  return lines.sort((a,b)=>a.y-b.y || a.x-b.x);
}

export function orderLines(lines, width, mode='auto') {
  const gutter = width/2;
  const left = lines.filter(l=>end(l)<gutter+3 && l.x<width*.35);
  const right = lines.filter(l=>l.x>gutter-3 && end(l)>width*.65);
  const paired = left.filter(l=>right.some(r=>Math.abs(r.y-l.y)<l.size*1.5));
  const double = mode==='double' || (mode==='auto' && left.length>=5 && right.length>=5 && paired.length>=4);
  if (!double) return lines.map(l=>({...l,column:0}));
  const spans = lines.filter(l=>l.x<gutter-6 && end(l)>gutter+6);
  const ordered=[];
  let remaining=lines.filter(l=>!spans.includes(l));
  const band = batch => {
    for (const column of [0,1]) ordered.push(...batch.filter(l=>(l.x>=gutter-3?1:0)===column)
      .sort((a,b)=>a.y-b.y || a.x-b.x).map(l=>({...l,column})));
  };
  for(const span of spans.sort((a,b)=>a.y-b.y)) {
    band(remaining.filter(l=>l.y<span.y-span.size*.4));
    remaining=remaining.filter(l=>l.y>=span.y-span.size*.4);
    ordered.push({...span,column:2});
  }
  band(remaining);
  return ordered;
}

function marginKey(text) {return text.toLowerCase().replace(/\d+/g,'#');}
export function joinText(a,b,words=new Set()) {
  if (/\u00ad$/.test(a)) return a.slice(0,-1)+b;
  const broken=a.match(/([\p{L}]+)-$/u), next=b.match(/^([\p{L}]+)/u);
  if(broken && next) {
    const combined=(broken[1]+next[1]).toLowerCase();
    const known=words.has(combined)||words.has(combined+'s')||(combined.endsWith('s')&&words.has(combined.slice(0,-1)));
    return (known?a.slice(0,-1):a)+b;
  }
  if (/[\u3400-\u9fff]$/.test(a) && /^[\u3400-\u9fff]/.test(b)) return a+b;
  return a+' '+b;
}

function kind(line,body) {
  if (/^(figure|fig\.|table|图|表)\s*\d/i.test(line.text)) return 'caption';
  if (/^([1-9]\d?(\.\d+)*\.?\s+[A-Z][a-z]|[A-Z](\.\d+)*\s+[A-Z][a-z])/.test(line.text) && line.text.length<95) return 'heading';
  if (/^[1-9]\d?(\.\d+)*\s+[A-Z][A-Za-z]{2,}\b/.test(line.text) && line.text.length<60) return 'heading';
  if (/^(abstract|references|acknowledg(e)?ments?|limitations|conclusion|appendix|摘要|参考文献)$/i.test(line.text)) return 'heading';
  if (line.size>body*1.2 && line.text.length<180) return 'heading';
  if ((line.math || /[∑∏∫√∈≠≤≥]/.test(line.text)) && (/[=∑∏∫]/.test(line.text) || line.text.length<35)) return 'equation';
  return line.size<body*.82?'note':'paragraph';
}

export function structureDocument(pages, {mode='auto',removeMargins=true}={}) {
  const frequency=new Map();
  for(const page of pages) {
    for(const key of new Set(page.lines.filter(l=>l.y<page.height*.075 || l.y>page.height*.92).map(l=>marginKey(l.text)))) {
      frequency.set(key,(frequency.get(key)||0)+1);
    }
  }
  const words=new Set(pages.flatMap(p=>p.lines.flatMap(l=>clean(l.text).toLowerCase().match(/[\p{L}]{3,}/gu)||[])));
  const blocks=[]; let removed=0;
  for(const page of pages) {
    const body=median(page.lines.filter(l=>l.text.length>35).map(l=>l.size));
    const publicationFooter=page.number===1 && page.lines.some(l=>l.y>page.height*.92 && /^Proceedings of /i.test(l.text));
    const lines=page.lines.filter(l=>{
      const margin=l.y<page.height*.075 || l.y>page.height*.92;
      const drop=removeMargins && margin && (/^\d+$/.test(l.text) || (publicationFooter && l.y>page.height*.935 && l.size<body) || (pages.length>1 && frequency.get(marginKey(l.text))>=Math.max(2,Math.ceil(pages.length*.5))));
      if(drop) removed++;
      return !drop;
    });
    let current=null, previous=null;
    for(const line of orderLines(lines,page.width,mode)) {
      const type=kind(line,body);
      const titleContinuation=current && current.type==='heading' && type==='heading' && line.size>body*1.2 && previous.size>body*1.2 && line.column===previous.column && line.y-previous.y<line.size*1.5;
      const continuation=current && current.type===type && ['paragraph','caption','note'].includes(type)
        && line.column===previous.column && line.y-previous.y<Math.max(body*1.65,previous.size*1.7)
        && line.y>=previous.y-body*.3 && !(line.x-previous.x>body*.85 && /[.!?:]$/.test(previous.text));
      if(continuation || titleContinuation) {
        current.text=joinText(current.text,line.text,words);
        current.box[2]=Math.max(current.box[2],end(line)); current.box[3]=Math.max(current.box[3],line.y+line.size*.3);
      } else {
        current={type,text:line.text,page:page.number,column:line.column,box:[line.x,line.y-line.size,end(line),line.y+line.size*.35]};
        blocks.push(current);
      }
      previous=line;
    }
  }
  // Merge unmistakable continuations across a column/page boundary, retaining source provenance.
  const merged=[];
  for(const block of blocks) {
    const last=merged.at(-1);
    if(last && last.type==='paragraph' && block.type==='paragraph' && (last.page!==block.page || last.column!==block.column)
      && !/[.!?:”)]$/.test(last.text) && /^[a-z]/.test(block.text)) {
      last.text=joinText(last.text,block.text,words);
      last.sourcePages=[...new Set([...(last.sourcePages||[last.page]),block.page])];
    } else merged.push({...block});
  }
  return {blocks:merged,removed,warnings:pages.filter(p=>p.lines.map(l=>l.text).join('').length<30).map(p=>`第 ${p.number} 页文字不足，可能需要 OCR。`)};
}
