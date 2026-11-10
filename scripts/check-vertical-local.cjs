// Локальная проверка: npm dependencies + Playwright и Chromium. Все API перехватываются в памяти.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path'), vm = require('node:vm');
process.chdir(path.resolve(__dirname, '..'));
const server = spawn('python3', ['-m', 'http.server', '18765', '--bind', '127.0.0.1'], {stdio: 'ignore'});
process.on('exit', () => server.kill());
const fs = require('fs'), assert = require('assert');
const original = require('../api/_defaults');
const fixture = {window:{}}; vm.runInNewContext(fs.readFileSync('js/catalog-default.js','utf8'), fixture); original.catalog = JSON.parse(JSON.stringify(fixture.window.PAMYAT_CATALOG_DEFAULT));
let content = JSON.parse(JSON.stringify(original)), writes = [];
(async () => {
 await new Promise(r => setTimeout(r, 1000));
 const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/local/bin/chromium',args:['--no-sandbox']});
 const ctx = await browser.newContext({viewport:{width:1360,height:900}});
 const errors=[];
 ctx.on('page',p => p.on('pageerror',e=>errors.push(e.message)));
 await ctx.route('**/*', async route => {
   const u = new URL(route.request().url());
   if (u.hostname !== '127.0.0.1') return route.abort();
   if (u.pathname === '/api/auth') return route.fulfill({json:{ok:true,user:'test'}});
   if (u.pathname === '/api/content') {
     if (route.request().method()==='PUT') { const b=route.request().postDataJSON(); writes.push(b); content[b.section]=b.value; return route.fulfill({json:{ok:true,content,versions:{catalog:'v2'}}}); }
     return route.fulfill({json:{ok:true,content,versions:{catalog:'v1',texts:'v1',calc:'v1',contacts:'v1'}}});
   }
   if (u.pathname.startsWith('/api/')) return route.fulfill({json:{ok:true,items:[],leads:[],notes:[],estimates:[],log:[]}});
   return route.continue();
 });
 const p=await ctx.newPage(); await p.goto('http://127.0.0.1:18765/admin.html',{waitUntil:'domcontentloaded'}); await p.waitForSelector('#catEd .catc', {state:'attached'});
 await p.locator('#nav button[data-p=catalog]').click(); const card=p.locator('.catc').first();
 console.log('category name',await card.locator('[name=name]').inputValue());
 assert.equal(await card.locator('[data-cx=g-name]').count(),6);
 await card.locator('[data-cx=g-name]').nth(0).fill('Особая серия');
 await card.locator('[data-cx=g-add]').click();
 let names=card.locator('[data-cx=g-name]'); await names.last().fill('Авторская группа');
 await card.locator('details[data-id=vertical] > summary').click(); await p.waitForTimeout(300);
 let e10=card.locator('.mod').filter({has: p.locator('input[name=code][value="E10"]')}); assert.equal(await e10.count(),1);
 let group=await names.last().locator('..').getAttribute('data-gx');
 let opts=await e10.locator('[data-cx=m-group] option').evaluateAll(es=>es.map(x=>({v:x.value,t:x.textContent})));
 let own=opts.find(x=>x.t==='Авторская группа'); assert(own);
 await e10.locator('[data-cx=m-group]').selectOption(own.v);
 await p.locator('[data-save=catalog]').first().click(); await p.waitForTimeout(500);
 assert.equal(writes.length,1); assert.equal(writes[0].section,'catalog');
 const saved=content.catalog; const cv=saved.categories.find(c=>c.id==='vertical');
 assert.equal(cv.groups[0].name,'Особая серия'); assert.equal(saved.items.find(i=>i.code==='E10'&&i.cat==='vertical').group,own.v);
 assert.equal(saved.items.find(i=>i.code==='E9'&&i.cat==='vertical').group,'series-e');
 for (let i=0; i<original.catalog.categories.length; i++) { let a={...original.catalog.categories[i]}, b={...saved.categories[i]}; delete a.groups; delete b.groups; assert.deepStrictEqual(b,a,'category data'); }
 for (let i=0; i<original.catalog.items.length; i++) { let a={...original.catalog.items[i]}, b={...saved.items[i]}; delete a.group; delete b.group; assert.deepStrictEqual(b,a,'item data'); }
 for (const old of original.catalog.items) { let x=saved.items.find(y=>y.cat===old.cat&&y.code===old.code); assert(x); assert.deepEqual(x.price,old.price,old.code); }
 for (const old of original.catalog.categories) { let x=saved.categories.find(y=>y.id===old.id); assert.deepEqual(x.price,old.price,old.id); }
 await p.reload(); await p.waitForSelector('#catEd .catc', {state:'attached'}); await p.locator('#nav button[data-p=catalog]').click(); assert.equal(await p.locator('.catc').first().locator('[data-cx=g-name]').first().inputValue(),'Особая серия');
 console.log('admin: edited, assigned, saved to mock, reloaded, prices unchanged');
 await p.goto('http://127.0.0.1:18765/catalog.html#vertical',{waitUntil:'domcontentloaded'}); await p.waitForSelector('.mc');
 await p.getByRole('button',{name:/Авторская группа/}).click(); assert.equal(await p.locator('.mc').count(),1); await p.locator('.mc').first().click();
 await p.waitForSelector('#clb.on'); console.log('model initial',await p.locator('#clbPic img').first().getAttribute('src'));
 assert((await p.locator('#clbPic img').first().getAttribute('src')).includes('/assets/catalog/md/E10.webp'));
 await p.locator('[data-preview=original]').click(); await p.waitForSelector('.czoom.on'); await p.waitForTimeout(400);
 assert((await p.locator('.czoom .zs img').getAttribute('src')).includes('catalog-originals/E10.webp'));
 await p.locator('.czoom .zx').click(); await p.locator('[data-preview="3d"]').click(); assert.equal(await p.locator('#clbPic [data-r3]').getAttribute('data-r3'),'E10');
 assert((await p.locator('#clbPic').innerText()).includes('Приблизительная визуализация'));
 await p.locator('[data-preview=photo]').click(); assert.equal(await p.locator('#clbPic [data-r3]').count(),0);
 console.log('catalog: filtering, E10 source, zoom, optional illustrative 3D, return');
 const phone=await ctx.newPage({viewport:{width:390,height:844}}); await phone.goto('http://127.0.0.1:18765/catalog.html#vertical',{waitUntil:'domcontentloaded'}); await phone.waitForSelector('.mc');
 await phone.getByRole('button',{name:/Авторская группа/}).click(); await phone.locator('.mc').first().click(); assert(await phone.locator('[data-preview=original]').isVisible()); console.log('mobile: filter and E10 controls visible');
 console.log('page errors:',JSON.stringify(errors)); assert.equal(errors.length,0); await browser.close(); server.kill();
})().catch(e=>{console.error(e);process.exit(1)});
