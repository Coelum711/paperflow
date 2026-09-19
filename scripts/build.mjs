import {mkdir, cp, copyFile} from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const out = new URL('extension/', root);
await mkdir(out, {recursive:true});
await copyFile(new URL('manifest.json', root), new URL('manifest.json', out));
await cp(new URL('src/', root), out, {recursive:true});
await mkdir(new URL('vendor/', out), {recursive:true});
for (const file of ['build/pdf.mjs', 'build/pdf.worker.mjs', 'cmaps', 'standard_fonts', 'wasm', 'LICENSE']) {
  await cp(new URL(`node_modules/pdfjs-dist/${file}`, root), new URL(`vendor/${file.split('/').at(-1)}`, out), {recursive:true});
}
console.log('Ready: extension/ — load this folder in Chrome.');
