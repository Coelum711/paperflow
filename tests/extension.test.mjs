import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
test('toolbar action opens ACL PDFs, local PDFs and chooser for internal tabs',async()=>{
  let listener,created;
  globalThis.chrome={action:{onClicked:{addListener:fn=>listener=fn}},runtime:{getURL:path=>'chrome-extension://test/'+path},tabs:{create:async args=>created=args.url}};
  await import('../src/background.js');
  await listener({url:'https://aclanthology.org/N19-1423/'});
  assert.equal(new URL(created).searchParams.get('source'),'https://aclanthology.org/N19-1423.pdf');
  await listener({url:'file:///papers/example.pdf'});
  assert.equal(new URL(created).searchParams.get('source'),'file:///papers/example.pdf');
  await listener({url:'chrome://extensions/'});
  assert.equal(new URL(created).searchParams.has('source'),false);
  delete globalThis.chrome;
});
test('built extension has local worker, font assets and MV3 entrypoints',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../extension/manifest.json',import.meta.url)));
  assert.equal(manifest.manifest_version,3);
  assert.deepEqual(manifest.permissions,['activeTab','storage']);
  for(const path of ['background.js','reader.html','reader.js','parser.js','layout.js','reader.css','vendor/pdf.mjs','vendor/pdf.worker.mjs','vendor/cmaps','vendor/standard_fonts','vendor/wasm','vendor/LICENSE'])await access(new URL('../extension/'+path,import.meta.url));
});
