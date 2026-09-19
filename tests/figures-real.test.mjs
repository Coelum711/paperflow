import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('BERT: all five captioned figures become renderable inline source images', {skip:!process.env.PAPERFLOW_TEST_PDF}, async()=>{
  // The legacy entry supplies Node canvas/typed-array polyfills; the adapter
  // under test remains the actual shipped browser adapter.
  await import('pdfjs-dist/legacy/build/pdf.mjs');
  const {createCanvas}=await import('@napi-rs/canvas');
  const {PdfJsParser}=await import('../extension/parser.js');
  const doc=await new PdfJsParser().open(new Uint8Array(await readFile(process.env.PAPERFLOW_TEST_PDF)));
  try {
    const figures=doc.reflow().blocks.filter(b=>b.type==='figure' && /^Figure [1-5]:/.test(b.text));
    assert.equal(figures.length,5,'captions alone are not inline figures');
    assert.ok(figures[0].text.includes('tions/answers).'),'the entire multiline caption stays with its figure');
    for(const figure of figures) {
      assert.equal(figure.figureFallback,false,'BERT figures should use actual crops, not a whole-page fallback');
      assert.ok(figure.box[3]-figure.box[1]>50,'figure crop includes the diagram, not only its caption');
      const canvas=createCanvas(1,1);await doc.renderRegion(figure.page,figure.box,canvas);
      const rgba=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let ink=0;for(let i=0;i<rgba.length;i+=4)if(rgba[i]<220||rgba[i+1]<220||rgba[i+2]<220)ink++;
      assert.ok(ink/(canvas.width*canvas.height)>.005,'crop is not blank');
    }
  } finally {await doc.destroy();}
});
