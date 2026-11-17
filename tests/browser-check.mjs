import {mkdirSync} from 'node:fs';
mkdirSync('screenshots',{recursive:true});
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});const page=await browser.newPage({viewport:{width:1440,height:1120}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const origin='http://127.0.0.1:4173';
try{
 await page.goto(origin);await page.getByRole('textbox',{name:'Document title',exact:true}).waitFor();await page.waitForFunction(()=>document.getElementById('editor').contentEditable==='true');
 await page.screenshot({path:'screenshots/editor-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'New document',exact:false}).click();await page.getByRole('textbox',{name:'Document title',exact:true}).fill('Browser QA document');await page.locator('#editor').fill('A useful shared idea.');
 await page.locator('#editor').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);});
 await page.getByRole('button',{name:'Bold',exact:true}).click();await page.waitForFunction(()=>document.getElementById('saved').textContent==='All changes saved');
 await page.reload();await page.waitForFunction(()=>document.getElementById('editor').contentEditable==='true');await page.getByRole('button',{name:/Browser QA document/}).click();assert.match(await page.locator('#editor').innerHTML(),/<b>|<strong>/);
 await page.getByRole('button',{name:'Share',exact:false}).click();await page.getByRole('dialog').waitFor();await page.locator('#invite').selectOption('ben');await page.getByRole('button',{name:'Give access'}).click();await page.getByRole('button',{name:'Remove Ben Carter'}).waitFor();await page.screenshot({path:'screenshots/sharing-desktop.png',fullPage:true});await page.getByRole('button',{name:'Close sharing'}).click();
 await page.getByLabel('Demo account',{exact:true}).selectOption('ben');await page.waitForFunction(()=>document.getElementById('avatar').textContent==='BC');await page.getByRole('button',{name:/Browser QA document/}).click();assert.match(await page.locator('#ownership').innerText(),/Shared by Alice/);
 await page.locator('#editor').press('End');await page.locator('#editor').press('Enter');await page.locator('#editor').pressSequentially('Added by Ben.');await page.waitForFunction(()=>document.getElementById('saved').textContent==='All changes saved');
 await page.getByLabel('Demo account',{exact:true}).selectOption('alice');await page.waitForFunction(()=>document.getElementById('avatar').textContent==='AC');await page.getByRole('button',{name:/Browser QA document/}).click();assert.match(await page.locator('#editor').innerText(),/Added by Ben/);
 await page.getByRole('button',{name:'Share',exact:false}).click();await page.getByRole('button',{name:'Remove Ben Carter'}).click();await page.getByRole('button',{name:'Give access'}).waitFor();await page.getByRole('button',{name:'Close sharing'}).click();
 await page.getByLabel('Demo account',{exact:true}).selectOption('ben');await page.waitForFunction(()=>document.getElementById('avatar').textContent==='BC');await page.waitForTimeout(200);assert.equal(await page.getByRole('button',{name:/Browser QA document/}).count(),0);
 await page.locator('#file').setInputFiles({name:'Field notes.txt',mimeType:'text/plain',buffer:Buffer.from('Field notes\n<script>alert(1)</script>\nA useful observation.')});await page.waitForFunction(()=>document.getElementById('title').value==='Field notes');assert.match(await page.locator('#editor').innerText(),/<script>/);assert.equal(await page.locator('#editor script').count(),0);
 // Force a real stale-write response and verify draft stays visible.
 await page.evaluate(async()=>{const user=sessionStorage.getItem('folio-user');const docs=await fetch('/api/documents',{headers:{'x-demo-user':user}}).then(r=>r.json());const doc=docs.documents.find(d=>d.title==='Field notes');await fetch('/api/documents/'+doc.id,{method:'PUT',headers:{'x-demo-user':user,'content-type':'application/json'},body:JSON.stringify({title:'Field notes',content:[{type:'p',children:['A newer remote edit.']}],version:doc.version})});});
 await page.locator('#editor').fill('My retained local draft.');await page.locator('#save-error').waitFor();assert.match(await page.locator('#save-error-text').innerText(),/newer version/);assert.equal(await page.locator('#editor').innerText(),'My retained local draft.');
 page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Reload latest'}).click();await page.waitForFunction(()=>document.getElementById('editor').innerText==='A newer remote edit.');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'screenshots/editor-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);console.log('PASS: browser create, rich formatting, save/reload, share/edit/revoke, import, conflict recovery, mobile overflow, no JS errors.');
}finally{await browser.close();}
