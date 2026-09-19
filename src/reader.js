import {PdfJsParser} from './parser.js';
const $=id=>document.getElementById(id);
const extension=!!globalThis.chrome?.runtime?.id;
let opened=null, busy=false, pendingUrl='', filename='paper', generation=0, readingAnchor=null;
const settings={size:20,leading:1.85,width:720,theme:'paper'};
function status(message,error=false) {$('status').textContent=message;$('status').className=error?'error':'';}
function setBusy(value) {
  busy=value;
  for(const id of ['choose','start','layout','margins']) $(id).disabled=value;
  $('url-form').querySelector('button').disabled=value;
  $('export').disabled=value||!opened;
}
function applySettings() {
  for(const [id,variable,unit] of [['size','--font-size','px'],['leading','--leading',''],['width','--measure','px']]) {
    document.documentElement.style.setProperty(variable,settings[id]+unit);
    $(id).value=settings[id];$(id+'-value').value=settings[id];
  }
  document.body.dataset.theme=settings.theme;$('theme').value=settings.theme;
}
try {
  const saved=extension?(await chrome.storage.local.get('reading')).reading:JSON.parse(localStorage.getItem('reading')||'null');
  if(saved) for(const key of Object.keys(settings)) if(key in saved) settings[key]=saved[key];
} catch { /* Reading works even if preference storage is disabled. */ }
applySettings();
for(const id of Object.keys(settings)) $(id).addEventListener('input',()=>{
  settings[id]=id==='theme'?$(id).value:Number($(id).value);applySettings();
  if(extension) chrome.storage.local.set({reading:settings}).catch(()=>{});
  else try {localStorage.setItem('reading',JSON.stringify(settings));} catch {}
});
if(matchMedia('(max-width:650px)').matches) document.querySelector('.settings').open=false;

for(const id of ['choose','start']) $(id).onclick=()=>$('file').click();
$('file').onchange=()=>{const file=$('file').files[0];if(file) loadFile(file);$('file').value='';};
document.addEventListener('dragover',event=>{event.preventDefault();document.body.classList.add('dragging');});
document.addEventListener('dragleave',event=>{if(!event.relatedTarget) document.body.classList.remove('dragging');});
document.addEventListener('drop',event=>{event.preventDefault();document.body.classList.remove('dragging');const file=event.dataTransfer.files[0];if(file&&!busy) loadFile(file);});

async function loadFile(file) {
  if(busy)return;
  if(file.size>80*1024*1024){status('这份文件超过 80 MB，请先拆分后再打开。',true);return;}
  setBusy(true);
  try {await convert(new Uint8Array(await file.arrayBuffer()),file.name);} catch(error) {showError(error);} finally {setBusy(false);}
}
function normalizeUrl(value) {
  const url=new URL(value);
  if(!['http:','https:','file:'].includes(url.protocol))throw Error('请使用网页 PDF 地址，或通过“打开 PDF”选择本地文件。');
  if(url.username||url.password)throw Error('请使用不包含账号密码的 PDF 地址。');
  if(url.hostname==='aclanthology.org'&&/^\/[\w.-]+\/$/.test(url.pathname))url.pathname=url.pathname.replace(/\/$/,'.pdf');
  return url;
}
async function loadUrl(value) {
  if(busy)return;
  $('authorize').hidden=true;
  setBusy(true);status('正在读取 PDF…');
  try {
    const url=normalizeUrl(value);pendingUrl=url.href;
    if(extension && url.protocol!=='file:') {
      const allowed=await chrome.permissions.contains({origins:[`${url.origin}/*`]});
      if(!allowed) {$('authorize').hidden=false;status(`需要允许读取 ${url.hostname}，或下载 PDF 后从本地打开。`);return;}
    }
    if(extension && url.protocol==='file:' && !await chrome.extension.isAllowedFileSchemeAccess()) {
      throw Error('请在扩展详情中开启“允许访问文件网址”，或直接点“打开 PDF”选择这份文件。');
    }
    const response=await fetch(url.href,{credentials:'include',signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw Error(`网站返回 ${response.status}。可先下载 PDF，再从本地打开。`);
    const reader=response.body.getReader();let size=0;const chunks=[];
    while(true) {
      const {value,done}=await reader.read();if(done)break;
      size+=value.length;
      if(size>80*1024*1024){await reader.cancel();throw Error('文件超过 80 MB，请拆分后打开。');}
      chunks.push(value);
    }
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const name=decodeURIComponent(url.pathname.split('/').pop()||'paper.pdf');
    await convert(bytes,name);
  } catch(error) {showError(error);} finally {setBusy(false);}
}
$('authorize').onclick=async()=>{
  try {
    const url=normalizeUrl(pendingUrl);
    const granted=await chrome.permissions.request({origins:[`${url.origin}/*`]});
    if(granted)await loadUrl(url.href);else status('未授权。仍可下载 PDF 后用“打开 PDF”阅读。');
  } catch(error) {showError(error);}
};
$('url-form').onsubmit=event=>{event.preventDefault();loadUrl($('url').value);};
function showError(error) {
  $('progress').hidden=true;
  const message=error.name==='PasswordException'?'这份 PDF 需要密码，请用原阅读器解锁并另存后再打开。':
    error.name==='InvalidPDFException'?'无法解析这份 PDF。请检查文件是否完整。':
    error instanceof TypeError?'读取失败。可能是网站访问限制；请下载 PDF 后通过“打开 PDF”选择文件。':error.message;
  status(message||'打开失败，请重新选择 PDF。',true);
}
async function convert(bytes,name) {
  if(!new TextDecoder('latin1').decode(bytes.subarray(0,1024)).includes('%PDF-'))throw Error('这个地址或文件不是 PDF。请打开论文的 PDF 下载链接，或选择 .pdf 文件。');
  $('authorize').hidden=true;$('progress').hidden=false;
  let candidate;
  try {
    candidate=await new PdfJsParser().open(bytes,{onProgress:(n,total)=>{
      $('progress').max=total;$('progress').value=n;status(`正在整理第 ${n} / ${total} 页…`);
    }});
    generation++;
    if(opened)await opened.destroy();
    opened=candidate;filename=name;
    $('filename').textContent=name;$('page-count').textContent=`${opened.pages.length} 页`;
    document.title=`${name} · Paperflow`;
    $('welcome').hidden=true;$('document').hidden=false;
    buildOriginals();await reflow();
    $('progress').hidden=true;
    status('已整理为单栏阅读。');
    $('article').focus({preventScroll:true});
  } catch(error) {if(candidate&&candidate!==opened)await candidate.destroy();throw error;}
}
function pageLink(number) {
  const link=document.createElement('a');link.className='page-link';link.href=`#original-${number}`;link.textContent=`原页 ${number}`;
  link.setAttribute('aria-label',`查看第 ${number} 页原文`);
  link.onclick=()=>{readingAnchor=link;$(`original-${number}`).open=true;};return link;
}
async function reflow() {
  if(!opened)return;
  const documentParser=opened, token=++generation;
  const result=opened.reflow({mode:$('layout').value,removeMargins:$('margins').checked});
  $('article').replaceChildren();$('toc').replaceChildren();
  $('notice').textContent=`只调整排版，未生成摘要。隐藏 ${result.removed} 行页眉／页脚。复杂图表、公式请对照原页；连字符仅在有依据时合并。`;
  $('warnings').hidden=!result.warnings.length;
  const warnings=$('warnings').querySelector('ul');warnings.replaceChildren();
  for(const text of result.warnings){const li=document.createElement('li');li.textContent=text;warnings.append(li);}
  let headingCount=0;const illustrations=[];
  for(const [index,block] of result.blocks.entries()) {
    let el=document.createElement(block.type==='heading'?(headingCount===0&&index<4?'h1':'h2'):['equation','figure'].includes(block.type)?'figure':'p');
    el.className=block.type;el.textContent=block.text;
    if(block.type==='heading') {
      el.id=`section-${++headingCount}`;const link=document.createElement('a');link.href='#'+el.id;link.textContent=block.text;$('toc').append(link);
    }
    if(['equation','figure'].includes(block.type))illustrations.push({el,block});
    for(const page of block.sourcePages||[block.page])el.append(pageLink(page));
    $('article').append(el);
  }
  if(!result.blocks.length) {
    const p=document.createElement('p');p.textContent='这份 PDF 暂时没有可提取的文字。你可以展开下方原页查看；扫描件需要后续 OCR 解析器。';$('article').append(p);
  }
  for(const {el,block} of illustrations) {
    if(token!==generation)return;
    try {
      const canvas=document.createElement('canvas');
      const page=opened.pages[block.page-1], [x,y,right,bottom]=block.box;
      await documentParser.renderRegion(block.page,[Math.max(0,x-3),Math.max(0,y-5),Math.min(page.width,right+3),Math.min(page.height,bottom+5)],canvas);
      if(token!==generation)return;
      const img=document.createElement('img');img.src=canvas.toDataURL('image/png');img.alt=block.type==='figure'?block.text:`公式原图。提取文字：${block.text}`;
      const caption=document.createElement('figcaption');caption.textContent=block.type==='figure'?block.text:'公式原图';
      if(block.figureFallback) {const note=document.createElement('span');note.className='figure-note';note.textContent='未能确定附图边界，显示完整原页。';caption.append(note);}
      caption.append(pageLink(block.page));el.replaceChildren(img,caption);
    } catch {
      const note=document.createElement('span');note.className='figure-note';note.textContent='原图未能加载，请点击原页查看。';el.append(note);
    }
  }
}
for(const id of ['layout','margins']) $(id).onchange=async()=>{setBusy(true);try{await reflow();}catch(error){showError(error);}finally{setBusy(false);}};
function buildOriginals() {
  $('page-list').replaceChildren();const parser=opened;
  for(const page of opened.pages) {
    const details=document.createElement('details');details.id=`original-${page.number}`;
    const summary=document.createElement('summary');summary.textContent=`第 ${page.number} 页 · 展开原页`;details.append(summary);
    const back=document.createElement('button');back.textContent='返回刚才阅读处';back.style.marginTop='12px';
    back.onclick=()=>{if(readingAnchor?.isConnected){readingAnchor.focus();readingAnchor.parentElement.scrollIntoView({block:'center'});}else $('article').scrollIntoView();};details.append(back);
    let rendering=false,rendered=false;
    details.ontoggle=async()=>{
      if(!details.open||rendering||rendered)return;
      rendering=true;const canvas=document.createElement('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`PDF 原页 ${page.number}，图表和公式的原始排版`);
      try{await parser.renderPage(page.number,canvas);details.append(canvas);rendered=true;}
      catch{summary.textContent=`第 ${page.number} 页 · 加载失败，收起后可重试`;}
      finally{rendering=false;}
    };
    $('page-list').append(details);
  }
}
$('export').onclick=async()=>{
  if(!opened||busy)return;setBusy(true);
  try {
    const copy=$('document').cloneNode(true);
    copy.hidden=false;copy.querySelector('#page-list').replaceChildren();
    for(const page of opened.pages) {
      status(`正在保存原页 ${page.number} / ${opened.pages.length}…`);
      const canvas=document.createElement('canvas');await opened.renderPage(page.number,canvas);
      const details=document.createElement('details');details.id=`original-${page.number}`;
      const summary=document.createElement('summary');summary.textContent=`第 ${page.number} 页原文`;
      const img=document.createElement('img');img.src=canvas.toDataURL('image/jpeg',.85);img.alt=`PDF 第 ${page.number} 页原图`;img.style.width='100%';
      details.append(summary,img);copy.querySelector('#page-list').append(details);
    }
    const css=await (await fetch('reader.css')).text();
    const html=document.implementation.createHTMLDocument(filename);
    html.documentElement.lang='zh-CN';
    const charset=document.createElement('meta');charset.setAttribute('charset','utf-8');html.head.prepend(charset);
    const viewport=document.createElement('meta');viewport.name='viewport';viewport.content='width=device-width,initial-scale=1';html.head.append(viewport);
    const style=document.createElement('style');style.textContent=css+'\nmain{padding:40px 24px}details:target{outline:2px solid var(--accent)}';html.head.append(style);
    html.documentElement.setAttribute('style',document.documentElement.getAttribute('style')||'');
    html.body.dataset.theme=settings.theme;
    const main=document.createElement('main');main.append(copy);html.body.append(main);
    const url=URL.createObjectURL(new Blob(['<!doctype html>\n'+html.documentElement.outerHTML],{type:'text/html;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=filename.replace(/\.pdf$/i,'')+'-paperflow.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    status('已保存 HTML，包含正文、公式与原页，可离线打开。');
  } catch(error){showError(error);}finally{setBusy(false);}
};
const source=new URL(location.href).searchParams.get('source');
if(source)loadUrl(source);
