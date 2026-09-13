// Convert the editable SVG illustrations into the PNGs embedded in README.md.
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../docs/images/',import.meta.url));
const {chromium}=await import(process.env.AUTORELOAD_PLAYWRIGHT?pathToFileURL(process.env.AUTORELOAD_PLAYWRIGHT).href:'playwright');
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({deviceScaleFactor:2});
  for(const name of (await readdir(root)).filter(n=>n.endsWith('.svg')).sort()){
    const svg=await readFile(path.join(root,name),'utf8');
    await page.setContent('<!doctype html><meta charset="utf-8"><style>body{margin:0}svg{display:block}</style>'+svg);
    await page.evaluate(()=>document.fonts.ready);
    const size=await page.locator('svg').evaluate(el=>({width:el.viewBox.baseVal.width,height:el.viewBox.baseVal.height}));
    await page.setViewportSize(size);
    await page.locator('svg').screenshot({path:path.join(root,name.replace(/\.svg$/,'.png'))});
    console.log(`${name} -> ${name.replace(/\.svg$/,'.png')} (${size.width*2} x ${size.height*2})`);
  }
}finally{await browser.close();}
