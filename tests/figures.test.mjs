import test from 'node:test';
import assert from 'node:assert/strict';
import {collectGraphics,locateFigures,reflowWithFigures} from '../src/figures.js';
import {structureDocument} from '../src/layout.js';
const OPS={save:1,restore:2,transform:3,paintFormXObjectBegin:4,paintFormXObjectEnd:5,beginGroup:6,constructPath:7,endPath:8,paintImageXObject:9,paintInlineImageXObject:10,paintImageMaskXObject:11};
const viewport={width:600,height:800,transform:[1,0,0,-1,0,800]};
const line=(text,x,y,width=180,size=10)=>({text,x,y,width,size});
test('raster images keep transform and viewport coordinates',()=>{
  const regions=collectGraphics({fnArray:[OPS.save,OPS.transform,OPS.paintImageXObject,OPS.restore],argsArray:[[],[200,0,0,100,50,500],['img'],[]]},OPS,viewport);
  assert.deepEqual(regions,[{box:[50,200,250,300],kind:'raster'}]);
});
test('vector-only form is retained, a clipping path alone is not a drawing',()=>{
  const regions=collectGraphics({fnArray:[OPS.save,OPS.transform,OPS.constructPath,OPS.restore,OPS.constructPath],argsArray:[[],[1,0,0,1,50,500],[23,[],[0,0,200,100]],[],[OPS.endPath,[],[0,0,600,800]]]},OPS,viewport);
  assert.equal(regions.length,1);assert.deepEqual(regions[0].box,[50,200,250,300]);
});
test('crop includes axis labels, removes graphic text from prose, preserves caption',()=>{
  const page={number:1,width:600,height:800,graphics:[{box:[80,100,260,220],kind:'vector'}],lines:[line('Accuracy',60,150,12),line('Training steps',100,238,100),line('Figure 1: Results.',50,270,210),line('The following paragraph stays.',50,310,210)]};
  const figure=locateFigures(page)[0];assert.ok(figure.box[0]<60&&figure.box[3]>238);
  const result=reflowWithFigures([page],structureDocument,{});
  assert.equal(result.blocks.filter(b=>b.type==='figure').length,1);
  assert.ok(!result.blocks.some(b=>/Accuracy|Training steps/.test(b.text)));
  assert.ok(result.blocks.some(b=>b.text==='The following paragraph stays.'));
});
test('prose mentioning Figure 5 is not another image; missing bounds fall back visibly',()=>{
  const page={number:1,width:600,height:800,graphics:[],lines:[line('Figure 5 presents the results',50,300),line('Figure 5: Results.',50,500)]};
  const regions=locateFigures(page);assert.equal(regions.length,1);assert.equal(regions[0].fallback,true);assert.deepEqual(regions[0].box,[0,0,600,800]);
});
