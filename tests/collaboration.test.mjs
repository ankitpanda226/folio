import {test} from 'node:test';import assert from 'node:assert/strict';import worker,{seed} from '../app/server.js';import {database} from '../scripts/db.mjs';
const p=text=>[{type:'p',children:[text]}];
async function fixture(fn){const DB=database();await seed(DB);const call=async(user,path,method='GET',body)=>{const r=await worker.fetch(new Request('https://folio.test/api'+path,{method,headers:{'x-demo-user':user,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{DB});return {status:r.status,data:await r.json()};};try{await fn(call,DB);}finally{DB.close();}}
test('Viewer can read versions and comments, but cannot edit, comment or manage access',()=>fixture(async call=>{
 const id=(await call('alice','/documents','POST',{title:'Read me',content:p('Original')})).data.document.id;
 await call('alice',`/documents/${id}/shares`,'POST',{user_id:'ben',role:'viewer'});
 assert.equal((await call('ben',`/documents/${id}`)).data.document.role,'viewer');
 assert.equal((await call('ben',`/documents/${id}`,'PUT',{title:'No',content:p('No'),version:1})).status,403);
 assert.equal((await call('ben',`/documents/${id}/comments`,'POST',{body:'No'})).status,403);
 assert.equal((await call('ben',`/documents/${id}/comments`)).status,200);
 assert.equal((await call('ben',`/documents/${id}/versions/1`)).status,200);
 assert.equal((await call('ben',`/documents/${id}/shares`,'POST',{user_id:'casey',role:'editor'})).status,403);
 await call('alice',`/documents/${id}/shares`,'POST',{user_id:'ben',role:'editor'});
 assert.equal((await call('ben',`/documents/${id}`,'PUT',{title:'Editable now',content:p('New'),version:1})).status,200);
}));
test('Every successful save creates one immutable snapshot; stale writes create none; restoration creates a new version',()=>fixture(async call=>{
 const id=(await call('alice','/documents','POST',{title:'v1',content:p('One')})).data.document.id;
 await call('alice',`/documents/${id}`,'PUT',{title:'v2',content:p('Two'),version:1});
 assert.equal((await call('alice',`/documents/${id}`,'PUT',{title:'stale',content:p('Bad'),version:1})).status,409);
 assert.deepEqual((await call('alice',`/documents/${id}/versions`)).data.versions.map(v=>v.version),[2,1]);
 const old=(await call('alice',`/documents/${id}/versions/1`)).data.snapshot;assert.deepEqual(old.content,p('One'));
 await call('alice',`/documents/${id}`,'PUT',{title:old.title,content:old.content,version:2});
 assert.deepEqual((await call('alice',`/documents/${id}/versions`)).data.versions.map(v=>v.version),[3,2,1]);
 assert.deepEqual((await call('alice',`/documents/${id}/versions/2`)).data.snapshot.content,p('Two'));
 assert.equal((await call('alice',`/documents/${id}/versions/3`)).data.snapshot.saved_by,'alice');
}));
test('Version-history storage failure rolls back the document write',()=>fixture(async(call,DB)=>{
 const id=(await call('alice','/documents','POST',{title:'Stable',content:p('Keep')})).data.document.id;
 await DB.prepare("CREATE TRIGGER reject_snapshot BEFORE INSERT ON document_versions WHEN NEW.version=2 BEGIN SELECT RAISE(ABORT,'test snapshot failure'); END").run();
 const original=console.error;console.error=()=>{};let r;try{r=await call('alice',`/documents/${id}`,'PUT',{title:'Uncommitted',content:p('Lose'),version:1});}finally{console.error=original;}
 assert.equal(r.status,500);const doc=(await call('alice',`/documents/${id}`)).data.document;assert.equal(doc.version,1);assert.equal(doc.title,'Stable');assert.deepEqual(doc.content,p('Keep'));
}));
test('Comments validate length, retain plain text, and enforce author/owner deletion',()=>fixture(async call=>{
 const id=(await call('alice','/documents','POST',{title:'Discuss'})).data.document.id;await call('alice',`/documents/${id}/shares`,'POST',{user_id:'ben'});
 for(const body of ['', ' ', 'x'.repeat(2001)])assert.equal((await call('ben',`/documents/${id}/comments`,'POST',{body})).status,400);
 const comment=(await call('alice',`/documents/${id}/comments`,'POST',{body:'<script>alert(1)</script>'})).data.comment;
 assert.equal((await call('ben',`/documents/${id}/comments`)).data.comments[0].body,'<script>alert(1)</script>');
 assert.equal((await call('ben',`/documents/${id}/comments`,'DELETE',{id:comment.id})).status,404);
 const bens=(await call('ben',`/documents/${id}/comments`,'POST',{body:'A useful comment'})).data.comment;
 assert.equal((await call('alice',`/documents/${id}/comments`,'DELETE',{id:bens.id})).status,200);
 assert.equal((await call('alice',`/documents/${id}/comments`)).data.comments.length,1);
}));
test('Presence groups sessions, expires stale activity, and viewer activity cannot claim editing',()=>fixture(async(call,DB)=>{
 const id='welcome-alice';await call('alice',`/documents/${id}/shares`,'POST',{user_id:'ben',role:'viewer'});
 await call('alice',`/documents/${id}/presence`,'POST',{session_id:'alice-1',editing:true});await call('alice',`/documents/${id}/presence`,'POST',{session_id:'alice-2',editing:false});
 const r=await call('ben',`/documents/${id}/presence`,'POST',{session_id:'ben-1',editing:true});assert.equal(r.data.people.length,2);assert.equal(r.data.people.find(p=>p.id==='alice').editing,1);assert.equal(r.data.people.find(p=>p.id==='ben').editing,0);
 await DB.prepare('UPDATE presence SET last_seen=? WHERE user_id=?').bind('2000-01-01T00:00:00.000Z','alice').run();assert.deepEqual((await call('ben',`/documents/${id}/presence`)).data.people.map(p=>p.id),['ben']);
 await call('ben',`/documents/${id}/presence`,'DELETE',{session_id:'ben-1'});assert.equal((await call('alice',`/documents/${id}/presence`)).data.people.length,0);
}));
test('Revocation denies comments, historical content and presence, and invalid roles reject',()=>fixture(async call=>{
 const id='welcome-alice';assert.equal((await call('alice',`/documents/${id}/shares`,'POST',{user_id:'ben',role:'owner'})).status,400);
 await call('alice',`/documents/${id}/shares`,'POST',{user_id:'ben'});await call('ben',`/documents/${id}/presence`,'POST',{session_id:'b'});await call('alice',`/documents/${id}/shares`,'DELETE',{user_id:'ben'});
 for(const suffix of ['/versions','/versions/1','/comments','/presence'])assert.equal((await call('ben',`/documents/${id}`+suffix)).status,404);
 assert.equal((await call('alice',`/documents/${id}/presence`)).data.people.length,0);
}));
test('Legacy documents gain a baseline snapshot without replacing content',()=>fixture(async call=>{
 const current=(await call('alice','/documents/welcome-alice')).data.document;
 const versions=(await call('alice','/documents/welcome-alice/versions')).data.versions;assert.equal(versions[0].version,current.version);assert.equal(versions[0].saved_by,null);
 assert.deepEqual((await call('alice','/documents/welcome-alice/versions/1')).data.snapshot.content,current.content);
}));

test('Extended toolbar nodes persist safely and remain available in version history',()=>fixture(async call=>{
 const content=[{type:'aside',children:[{type:'p',children:['A note ✓']}],onclick:'bad'},{type:'hr',children:[]},{type:'h4',children:['Details']},{type:'pre',children:['a < b']},{type:'p',children:[{type:'s',children:['old']},{type:'mark',children:['key']}]}];
 const created=await call('alice','/documents','POST',{title:'Extended formatting',content});assert.equal(created.status,201);const id=created.data.document.id;
 const read=(await call('alice',`/documents/${id}`)).data.document;assert.equal(read.content[0].type,'aside');assert.equal(read.content[0].onclick,undefined);assert.equal(read.content[1].type,'hr');assert.deepEqual((await call('alice',`/documents/${id}/versions/1`)).data.snapshot.content,read.content);
}));
