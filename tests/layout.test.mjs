import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLines,orderLines,structureDocument,joinText} from '../src/layout.js';
const line=(text,x,y,width=210,size=10)=>({text,x,y,width,size});
test('two columns read down left then down right, below a spanning title',()=>{
  const lines=[line('Title across the whole paper',80,50,440,16)];
  for(let i=0;i<8;i++)lines.push(line('Left '+i,50,100+i*12),line('Right '+i,320,100+i*12));
  assert.deepEqual(orderLines(lines,600).map(l=>l.text),['Title across the whole paper',...Array.from({length:8},(_,i)=>'Left '+i),...Array.from({length:8},(_,i)=>'Right '+i)]);
});
test('spanning section divides column bands without losing text',()=>{
  const lines=[line('L before',50,100),line('R before',320,100),line('Across',50,150,490),line('L after',50,200),line('R after',320,200)];
  assert.deepEqual(orderLines(lines,600,'double').map(l=>l.text),['L before','R before','Across','L after','R after']);
});
test('repeated margin text removed but identical body text survives',()=>{
  const pages=[1,2,3].map(number=>({number,width:600,height:800,lines:[line('Conference 2026',40,20),line('Repeated body',40,120),line(''+number,300,780,12)]}));
  const result=structureDocument(pages);
  assert.equal(result.removed,6);assert.equal(result.blocks.length,3);
  assert.equal(structureDocument(pages,{removeMargins:false}).removed,0);
});
test('dehyphenation is evidence based and preserves compound words',()=>{
  assert.equal(joinText('repre-','sentation',new Set(['representation'])),'representation');
  assert.equal(joinText('state-','of-the-art'),'state-of-the-art');
  assert.equal(joinText('trans\u00ad','former'),'transformer');
  assert.equal(joinText('中文','连续'),'中文连续');
});
test('rows split across gutter, nearby glyphs preserve words and spaces',()=>{
  const items=[{text:'Hello',x:40,y:100,width:25,size:10},{text:'world',x:69,y:100,width:25,size:10},{text:'Other column',x:320,y:100,width:80,size:10}];
  assert.deepEqual(makeLines(items).map(l=>l.text),['Hello world','Other column']);
});
test('scan-only pages produce an OCR warning',()=>{
  assert.equal(structureDocument([{number:1,width:600,height:800,lines:[]}]).warnings.length,1);
});
test('ACL narrow 17pt gutter does not interleave columns',()=>{
  const items=[{text:'Left paragraph',x:72,y:586,width:218,size:10.9},{text:'Right paragraph',x:307,y:586.5,width:218,size:10.9}];
  assert.deepEqual(makeLines(items,595).map(l=>l.text),['Left paragraph','Right paragraph']);
});
test('column continuation joins without erasing page provenance',()=>{
  const pages=[{number:1,width:600,height:800,lines:[line('A sentence carries',50,700)]},{number:2,width:600,height:800,lines:[line('on to the next page.',50,100)]}];
  const result=structureDocument(pages);
  assert.equal(result.blocks[0].text,'A sentence carries on to the next page.');
  assert.deepEqual(result.blocks[0].sourcePages,[1,2]);
});
