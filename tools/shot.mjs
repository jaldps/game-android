// Screenshot a page in headless Chromium (WebGL via SwiftShader), phone-sized.
// Usage: node tools/shot.mjs <path-under-web e.g. games/hole/index.html?autoplay=1> <out-prefix> [--landscape] [--times 2000,6000,12000] [--w 412 --h 915] [--dpr 2.625] [--eval "js to run after load"] [--tap x,y@ms ...]
// Writes <out-prefix>-<ms>.png for each time, and <out-prefix>-console.txt with console output/errors.
import { chromium } from 'playwright-core';
import fs from 'fs';
const a = process.argv.slice(2); const target = a[0], out = a[1];
const opt = (k,d)=>{ const i=a.indexOf('--'+k); return i>=0 ? a[i+1] : d; };
const all = k => a.flatMap((v,i)=> v==='--'+k ? [a[i+1]] : []);
let w = +opt('w',412), h = +opt('h',915); if (a.includes('--landscape')) [w,h]=[Math.max(w,h),Math.min(w,h)];
const dpr = +opt('dpr',2), times = opt('times','3000,8000').split(',').map(Number), port = opt('port','8080');
fs.mkdirSync(out.split('/').slice(0,-1).join('/')||'.',{recursive:true});
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport:{width:w,height:h}, deviceScaleFactor:dpr, hasTouch:true, isMobile:true });
const log=[]; page.on('console',m=>log.push(`[${m.type()}] ${m.text()}`)); page.on('pageerror',e=>log.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://127.0.0.1:${port}/${target}`, { waitUntil:'load', timeout:150000 });
const ev = opt('eval'); if (ev) { try { log.push('[eval] '+JSON.stringify(await page.evaluate(ev))); } catch(e){ log.push('[evalerror] '+e.message); } }
const swipes = all('swipe').map(s=>{const [xy,ms]=s.split('@'); const [x1,y1,x2,y2]=xy.split(',').map(Number); return {x1,y1,x2,y2,ms:+ms,k:'swipe'};});
const taps = all('tap').map(s=>{const [xy,ms]=s.split('@'); const [x,y]=xy.split(',').map(Number); return {x,y,ms:+ms};});
const t0 = Date.now(); const events=[...swipes,...taps.map(t=>({...t,k:'tap'})), ...times.map(ms=>({ms,k:'shot'}))].sort((p,q)=>p.ms-q.ms);
for (const e of events) { const wait = e.ms-(Date.now()-t0); if (wait>0) await page.waitForTimeout(wait);
  if (e.k==='tap') await page.touchscreen.tap(e.x,e.y); else if (e.k==='swipe') { const cdp = await page.context().newCDPSession(page); const N=8; await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:e.x1,y:e.y1}]}); for(let i=1;i<=N;i++){ await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:e.x1+(e.x2-e.x1)*i/N,y:e.y1+(e.y2-e.y1)*i/N}]}); await page.waitForTimeout(16);} await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); } else { await page.screenshot({path:`${out}-${e.ms}.png`, timeout:150000}); } }
const fps = await page.evaluate(()=>window.__fps||null).catch(()=>null); log.push('[fps] '+fps);
fs.writeFileSync(`${out}-console.txt`, log.join('\n')); await browser.close();
console.log('ok', events.filter(e=>e.k==='shot').map(e=>`${out}-${e.ms}.png`).join(' '));
