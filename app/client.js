const $=id=>document.getElementById(id);
const state={user:sessionStorage.getItem('folio-user')||'alice',users:[],docs:[],current:null,filter:'all',dirty:false,seq:0,saving:null,timer:null,busy:false,conflict:false,accessLost:false};
const icons=name=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');const use=document.createElementNS(svg.namespaceURI,'use');use.setAttribute('href','#i-'+name);svg.append(use);return svg;};
const element=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const initials=name=>name.split(' ').map(s=>s[0]).join('');
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toast').hidden=true,4500);}
async function api(path,options={}){
 const response=await fetch('/api'+path,{...options,headers:{'content-type':'application/json','x-demo-user':state.user},...(options.body?{body:JSON.stringify(options.body)}:{})});
 let data;try{data=await response.json();}catch{throw new Error('Could not reach the server. Please retry.');}
 if(!response.ok){const e=new Error(data.error||'Request failed.');e.status=response.status;throw e;}return data;
}
function setSaved(message,ok=false){$('saved').replaceChildren(...(ok?[icons('check')]:[]),document.createTextNode(message));
 $('detail-saved').textContent=ok&&state.current?new Date(state.current.updated_at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):state.current?message:'—';
}
const allowed=new Set(['p','div','h1','h2','h3','strong','b','em','i','u','ul','ol','li','br','blockquote','h4','pre','code','aside','hr','s','mark','sub','sup']);
// Strip attributes and unsafe elements; the server validates this same restricted structure.
function serialize(root){
 return [...root.childNodes].flatMap(n=>{
  if(n.nodeType===3)return [n.textContent];
  if(n.nodeType!==1)return [];
  const type=n.tagName.toLowerCase();if(['script','style','iframe','object'].includes(type))return [];
  const children=serialize(n);return allowed.has(type)?[{type,children}]:children;
 });
}
function renderTree(tree,root){for(const n of tree){if(typeof n==='string')root.append(document.createTextNode(n));else{const el=document.createElement(n.type);renderTree(n.children,el);root.append(el);}}}
function countWords(){const text=$('editor').innerText.trim();const words=text?text.split(/\s+/u).length:0;$('word-count').textContent=words+' '+(words===1?'word':'words');
 $('reading-time').textContent=words<200?'Less than a minute':Math.ceil(words/200)+' min read';
 renderOutline();
}
function renderOutline(){
 const headings=[...$('editor').querySelectorAll('h1,h2,h3,h4')];$('outline').replaceChildren();
 if(!headings.length){$('outline').append(element('p','outline-empty','Add a heading to give your ideas a little structure.'));return;}
 for(const h of headings){const b=element('button','outline-item level-'+h.tagName.toLowerCase(),h.textContent.trim()||'Untitled heading');b.title=b.textContent;
  b.addEventListener('click',()=>{h.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});for(const item of $('outline').children)item.classList.toggle('selected',item===b);});$('outline').append(b);
 }
}
function updateAccess(count){$('share-count').textContent=count||'';$('detail-access').textContent=state.current?.owner_id===state.user?(count?'You + '+count+' '+(count===1?'collaborator':'collaborators'):'Only you'):'Shared with you';}
function setDrawer(open){$('sidebar').classList.toggle('open',open);$('mobile-menu').setAttribute('aria-expanded',String(open));$('drawer-backdrop').hidden=!open;$('sidebar').inert=(matchMedia('(max-width:780px)').matches&&!open)||document.body.classList.contains('focus-mode');}

function showSaveError(error){state.conflict=error.status===409;$('save-error').hidden=false;$('save-error-text').textContent=error.message;$('retry').hidden=state.conflict;setSaved(state.conflict?'Conflict · draft retained':'Not saved · draft retained');}
function changed(){if(!state.current||!canEdit())return;lastTyped=Date.now();if(Date.now()-lastPulse>2500)heartbeat();state.dirty=true;state.seq++;countWords();setSaved('Unsaved changes');clearTimeout(state.timer);if(!state.conflict)state.timer=setTimeout(()=>save(),700);}
async function save(){
 clearTimeout(state.timer);
 if(state.saving){await state.saving;if(!state.dirty)return true;if(state.conflict||!$('save-error').hidden)return false;return save();}
 if(!state.dirty||!state.current)return true;if(state.conflict)return false;
 state.saving=(async()=>{
  try{
   while(state.dirty){const seq=state.seq;const payload={title:$('title').value,content:serialize($('editor')),version:state.current.version};setSaved('Saving…');
    const result=await api('/documents/'+state.current.id,{method:'PUT',body:payload});state.current.version=result.version;state.current.updated_at=result.updated_at;state.current.title=payload.title;
    $('version').textContent='Version '+result.version;
    const item=state.docs.find(d=>d.id===state.current.id);if(item)Object.assign(item,{title:payload.title,updated_at:result.updated_at,version:result.version});
    state.dirty=state.seq!==seq;
   }
   $('save-error').hidden=true;setSaved('All changes saved',true);renderList();return true;
  }catch(e){showSaveError(e);return false;}
 })();
 const result=await state.saving;state.saving=null;return result;
}
async function guarded(fn){if(state.busy){notify('One moment — finishing your last action.');return;}state.busy=true;$('title').disabled=true;$('editor').contentEditable='false';document.body.classList.add('is-loading');try{await fn();}catch(e){notify(e.message);}finally{state.busy=false;updatePermissions();document.body.classList.remove('is-loading');}}
function age(iso){const date=new Date(iso),days=Math.floor((Date.now()-date.getTime())/86400000);return days===0?'Today':days===1?'Yesterday':date.toLocaleDateString(undefined,{month:'short',day:'numeric'});}
function renderList(){
 const query=$('search').value.trim().toLowerCase();const docs=state.docs.filter(d=>(state.filter==='all'||(state.filter==='owned'?d.owner_id===state.user:d.owner_id!==state.user))&&d.title.toLowerCase().includes(query));
 $('all-count').textContent=state.docs.length;$('doc-count').textContent=docs.length;$('documents').replaceChildren();
 if(!docs.length){$('documents').append(element('p','list-message',query?'No documents match your search.':state.filter==='shared'?'No shared documents yet. Switch accounts and invite yourself to a document.':'A fresh start. Create a document or bring in a .txt file.'));return;}
 for(const d of docs){const button=element('button','doc-item'+(d.id===state.current?.id?' active':''));button.setAttribute('aria-current',d.id===state.current?.id?'page':'false');const copy=element('span');copy.append(element('strong','',d.title),element('small',d.owner_id===state.user?'':'shared-badge',(d.owner_id===state.user?'Owned by you':'Shared by '+d.owner_name.split(' ')[0])+' · '+age(d.updated_at)));button.append(icons('doc'),copy);button.addEventListener('click',()=>guarded(async()=>{if(await save())await openDoc(d.id);else notify('Save or download your draft before switching documents.');}));$('documents').append(button);}
}
async function refreshList(){state.docs=(await api('/documents')).documents;renderList();}
async function openDoc(id){
 const {document:doc}=await api('/documents/'+id);await leavePresence();state.current=doc;state.accessLost=false;state.dirty=false;state.conflict=false;state.seq=0;$('save-error').hidden=true;
 $('title').value=doc.title;$('title').disabled=!canEdit();$('editor').replaceChildren();renderTree(doc.content,$('editor'));$('editor').contentEditable=canEdit()?'true':'false';$('editor').inert=false;
 $('ownership').textContent=doc.owner_id===state.user?'Owned by you':'Shared by '+doc.owner_name;$('version').textContent='Version '+doc.version;setSaved('All changes saved',true);countWords();renderList();setDrawer(false);$('surface').scrollTop=0;selection=null;
 try{const data=await api('/documents/'+doc.id+'/shares');updateAccess(data.members.length);}catch{updateAccess(0);}updatePermissions();heartbeat(true);loadComments(false).catch(()=>{});
}
function emptyEditor(){state.current=null;$('editor').replaceChildren();$('editor').contentEditable='false';$('title').value='';$('title').disabled=true;$('ownership').textContent='Create a document to get started';setSaved('Ready when you are');$('version').textContent='—';$('share-count').textContent='';$('detail-access').textContent='—';countWords();}
async function start(){
 if(!['alice','ben','casey'].includes(state.user))state.user='alice';$('user').value=state.user;
 const data=await api('/bootstrap');state.users=data.users;updateAccount();await refreshList();
 const selected=state.docs.find(d=>d.id==='welcome-alice')||state.docs[0];if(selected)await openDoc(selected.id);else emptyEditor();
}
function updateAccount(){const user=state.users.find(u=>u.id===state.user);$('avatar').textContent=initials(user.name);$('user').value=state.user;}
$('editor').addEventListener('input',changed);$('title').addEventListener('input',changed);$('title').addEventListener('blur',()=>{if(state.dirty)save();});
// Plain-text paste/drop keeps imported web markup and active content out of the editor.
$('editor').addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));changed();});
$('editor').addEventListener('drop',e=>{e.preventDefault();notify('Use Import to bring a .txt file into the workspace.');});
let selection=null;
document.addEventListener('selectionchange',()=>{const s=window.getSelection();if(s.rangeCount&&$('editor').contains(s.anchorNode)){selection=s.getRangeAt(0).cloneRange();for(const b of $('toolbar').querySelectorAll('[data-command]')){if(['bold','italic','underline','strikeThrough','insertUnorderedList','insertOrderedList'].includes(b.dataset.command))b.setAttribute('aria-pressed',String(document.queryCommandState(b.dataset.command)));}}});
function restoreSelection(){const s=window.getSelection();$('editor').focus();if(selection&&$('editor').contains(selection.commonAncestorContainer)){s.removeAllRanges();s.addRange(selection);}}
for(const button of $('toolbar').querySelectorAll('[data-command]')){
 button.addEventListener('mousedown',e=>e.preventDefault());button.addEventListener('click',()=>{if(!state.current||!canEdit())return;restoreSelection();document.execCommand(button.dataset.command,false);changed();});
}
$('block').addEventListener('change',()=>{if(!state.current||!canEdit())return;restoreSelection();document.execCommand('formatBlock',false,$('block').value);changed();});
// Structural inserts use DOM nodes so the browser cannot flatten semantic blocks into styled spans.
function selectInserted(node,selectAll=false){const range=document.createRange();range.selectNodeContents(node);if(!selectAll)range.collapse(false);const s=window.getSelection();s.removeAllRanges();s.addRange(range);selection=range.cloneRange();$('editor').focus();}
function insertBlock(type){if(!canEdit())return;restoreSelection();const editor=$('editor'),s=window.getSelection();let anchor=s?.anchorNode;
 while(anchor&&anchor.parentNode!==editor)anchor=anchor.parentNode;
 const block=element(type);if(type==='aside')block.append(element('p','','Write an important note here.'));
 const next=element('p');next.append(element('br'));const fragment=document.createDocumentFragment();fragment.append(block,next);
 if(anchor&&anchor!==editor)anchor.after(fragment);else editor.append(fragment);
 selectInserted(type==='aside'?block.firstChild:next,type==='aside');changed();
}
$('insert').addEventListener('change',()=>{const value=$('insert').value;$('insert').value='';if(!canEdit()||!value)return;
 if(value==='callout')insertBlock('aside');else if(value==='divider')insertBlock('hr');
 else {restoreSelection();document.execCommand('insertText',false,value);changed();}
});
$('highlight').addEventListener('mousedown',e=>e.preventDefault());
$('highlight').addEventListener('click',()=>{if(!canEdit())return;restoreSelection();const range=window.getSelection()?.getRangeAt(0);if(!range||range.collapsed){notify('Select some text to highlight.');return;}
 const fragment=range.cloneContents();if(fragment.querySelector('p,div,h1,h2,h3,h4,aside,pre,ul,ol,li,blockquote,hr')){notify('Highlight text within one paragraph at a time.');return;}
 const mark=element('mark');renderTree(serialize(fragment),mark);range.deleteContents();range.insertNode(mark);selectInserted(mark);changed();
});
$('search').addEventListener('input',renderList);
for(const b of document.querySelectorAll('[data-filter]'))b.addEventListener('click',()=>{state.filter=b.dataset.filter;for(const t of document.querySelectorAll('[data-filter]'))t.setAttribute('aria-selected',String(t===b));renderList();});
$('new').addEventListener('click',()=>guarded(async()=>{if(!await save()){notify('Resolve your unsaved draft first.');return;}const {document:doc}=await api('/documents',{method:'POST',body:{title:'Untitled document'}});await refreshList();await openDoc(doc.id);$('title').focus();$('title').select();notify('A fresh page, all yours.');}));
$('user').addEventListener('change',()=>{const next=$('user').value;$('user').value=state.user;guarded(async()=>{if(!await save()){notify('Resolve your unsaved draft before switching accounts.');return;}await leavePresence();state.user=next;sessionStorage.setItem('folio-user',next);selection=null;state.filter='all';$('search').value='';for(const t of document.querySelectorAll('[data-filter]')){t.setAttribute('aria-selected',String(t.dataset.filter==='all'));t.tabIndex=t.dataset.filter==='all'?0:-1;}updateAccount();emptyEditor();await refreshList();if(state.docs.length)await openDoc(state.docs[0].id);notify('Now viewing as '+state.users.find(u=>u.id===next).name);});});
$('import').addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',()=>guarded(async()=>{
 const file=$('file').files[0];$('file').value='';if(!file)return;
 if(!file.name.toLowerCase().endsWith('.txt'))throw new Error('Choose a .txt file. Other file types are not supported.');if(file.size>100000)throw new Error('Choose a .txt file up to 100 KB.');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}catch{throw new Error('This file is not valid UTF-8 text. Please save it as UTF-8 and retry.');}
 if(!await save()){notify('Resolve your unsaved draft before importing.');return;}
 const {document:doc}=await api('/import',{method:'POST',body:{filename:file.name,text}});await refreshList();await openDoc(doc.id);notify('Imported '+file.name+'. Ready to make it yours.');
}));
function download(filename,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=element('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportDraft(format='html'){if(!state.current)return;if(format==='markdown'){download(($('title').value||'Untitled').replace(/[^a-zA-Z0-9 _-]/g,'').slice(0,100)+'.md',toMarkdown(serialize($('editor'))),'text/markdown; charset=utf-8');return;}const safe=element('div');renderTree(serialize($('editor')),safe);const t=$('title').value||'Untitled';const titleNode=element('title','',t);download(t.replace(/[^a-zA-Z0-9 _-]/g,'').slice(0,100)+'.html','<!doctype html><html lang="en"><head><meta charset="utf-8"><style>body{max-width:800px;margin:40px auto;padding:0 24px;font:17px/1.7 system-ui}aside{border:1px solid #91b8ac;background:#eff8f3;padding:16px;border-radius:8px}pre{white-space:pre-wrap;background:#f3f3f3;padding:16px}mark{background:#fff0a8;color:#171717}hr{border:0;border-top:1px solid #999;margin:24px 0}</style>'+titleNode.outerHTML+'</head><body>'+safe.innerHTML+'</body></html>','text/html');}
$('export').addEventListener('click',()=>{if(!state.current){notify('Create a document first.');return;}$('export-dialog').showModal();});$('draft-download').addEventListener('click',()=>exportDraft('html'));$('retry').addEventListener('click',save);
$('reload-doc').addEventListener('click',()=>guarded(async()=>{if(!state.current)return;if(!confirm('Replace your unsaved draft with the latest server version? Download your draft first to keep a copy.'))return;await openDoc(state.current.id);notify('Loaded the latest saved version.');}));
async function renderShares(){
 const data=await api('/documents/'+state.current.id+'/shares');const owner=state.current.owner_id===state.user;$('members').replaceChildren();
 for(const member of [data.owner,...data.members]){const row=element('div','member');row.append(element('span','avatar',initials(member.name)));const copy=element('div','member-name',member.name+(member.id===state.user?' (you)':''));copy.append(element('small','',member.email));row.append(copy,element('span','member-role',member.id===data.owner.id?'Owner':member.role==='viewer'?'Can view':'Can edit'));
  if(owner&&member.id!==data.owner.id){const role=element('select','member-role-select');role.setAttribute('aria-label','Access for '+member.name);for(const [value,label] of [['editor','Can edit'],['viewer','Can view']]){const option=element('option','',label);option.value=value;role.append(option);}role.value=member.role;role.addEventListener('change',async()=>{role.disabled=true;try{await api('/documents/'+state.current.id+'/shares',{method:'POST',body:{user_id:member.id,role:role.value}});await renderShares();notify('Updated access for '+member.name);}catch(e){$('share-error').textContent=e.message;role.disabled=false;}});row.querySelector('.member-role').replaceWith(role);const remove=element('button','','Remove');remove.setAttribute('aria-label','Remove '+member.name);remove.addEventListener('click',async()=>{remove.disabled=true;try{await api('/documents/'+state.current.id+'/shares',{method:'DELETE',body:{user_id:member.id}});await renderShares();notify('Access removed for '+member.name);}catch(e){$('share-error').textContent=e.message;remove.disabled=false;}});row.append(remove);}
  $('members').append(row);
 }
 $('invite-form').hidden=!owner;$('invite').replaceChildren();const available=state.users.filter(u=>u.id!==data.owner.id&&!data.members.some(m=>m.id===u.id));for(const u of available){const opt=element('option','',u.name+' · '+u.email);opt.value=u.id;$('invite').append(opt);}
 $('invite-form').hidden=!owner||!available.length;updateAccess(data.members.length);$('share-doc-name').textContent=state.current.title;
}
$('share').addEventListener('click',()=>guarded(async()=>{if(!state.current){notify('Create a document first.');return;}if(!await save()){notify('Save your draft before sharing.');return;}$('share-error').textContent='';await renderShares();$('share-dialog').showModal();}));
$('invite-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;$('share-error').textContent='';try{await api('/documents/'+state.current.id+'/shares',{method:'POST',body:{user_id:$('invite').value,role:$('invite-role').value}});await renderShares();notify('Access granted. Switch accounts to try it.');}catch(err){$('share-error').textContent=err.message;}finally{button.disabled=false;}});
$('mobile-menu').addEventListener('click',()=>setDrawer(!$('sidebar').classList.contains('open')));
$('drawer-backdrop').addEventListener('click',()=>{setDrawer(false);$('mobile-menu').focus();});
matchMedia('(max-width:780px)').addEventListener('change',()=>setDrawer(false));setDrawer(false);
$('focus').addEventListener('click',()=>{const on=document.body.classList.toggle('focus-mode');$('focus').setAttribute('aria-pressed',String(on));$('focus').setAttribute('aria-label',on?'Exit focus mode':'Enter focus mode');$('focus').title=on?'Exit focus mode':'Enter focus mode';$('focus').querySelector('span').textContent=on?'Exit focus':'Focus';setDrawer(false);notify(on?'Focus mode. A little more room to think.':'Workspace navigation restored.');});
for(const [i,t] of [...document.querySelectorAll('[data-filter]')].entries()){t.tabIndex=i===0?0:-1;t.addEventListener('click',()=>{for(const item of document.querySelectorAll('[data-filter]'))item.tabIndex=item===t?0:-1;});t.addEventListener('keydown',e=>{const tabs=[...document.querySelectorAll('[data-filter]')];const at=tabs.indexOf(t);const next=e.key==='ArrowRight'?(at+1)%tabs.length:e.key==='ArrowLeft'?(at+tabs.length-1)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:null;if(next!==null){e.preventDefault();tabs[next].click();tabs[next].focus();}});}

document.addEventListener('click',e=>{if(innerWidth<=780&&!e.target.closest('#sidebar')&&!e.target.closest('#mobile-menu'))setDrawer(false);});
window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('sidebar').classList.contains('open')){setDrawer(false);$('mobile-menu').focus();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}if(e.key.toLowerCase()==='n'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.target.closest('input,select,textarea,[contenteditable="true"]')&&!$('share-dialog').open)$('new').click();});

// Shared-work features use the same identity and permission-checked API as the editor.
const presenceSession=crypto.randomUUID();let lastTyped=0,lastPulse=0,presenceBusy=false,selectedSnapshot=null;
function canEdit(){return !!state.current&&state.current.role!=='viewer'&&!state.accessLost;}
function updatePermissions(){
 $('trash-document').hidden=!state.current||state.current.owner_id!==state.user||state.accessLost;
 const editable=canEdit();$('title').disabled=!editable;$('editor').contentEditable=editable?'true':'false';
 for(const b of $('toolbar').querySelectorAll('button,select'))b.disabled=!editable;
 $('toolbar').setAttribute('aria-label',editable?'Text formatting':'Text formatting — view-only access');
 document.querySelector('.toolbar-tail').lastChild.textContent=editable?' Editing mode':' View only';
 $('comment-form').hidden=!editable;$('comments-notice').hidden=editable;
}
async function leavePresence(){
 if(!state.current)return;
 try{await api('/documents/'+state.current.id+'/presence',{method:'DELETE',body:{session_id:presenceSession}});}catch{}
}
async function heartbeat(force=false){
 if(!state.current||document.hidden||presenceBusy||(!force&&state.busy)||state.accessLost)return;
 const id=state.current.id,user=state.user;presenceBusy=true;lastPulse=Date.now();
 try{
  const data=await api('/documents/'+id+'/presence',{method:'POST',body:{session_id:presenceSession,editing:canEdit()&&Date.now()-lastTyped<3000}});
  if(state.current?.id!==id||state.user!==user)return;
  if(data.role!==state.current.role){state.current.role=data.role;updatePermissions();if(!canEdit()&&state.dirty)showSaveError(new Error('Your access changed to viewer. Download your draft, then reload.'));}
  const others=data.people.filter(p=>p.id!==state.user);const label=others.length?others.map(p=>p.name.split(' ')[0]+(p.editing?' · editing':' · viewing')).join('   '):'Just you here';
  if($('presence').textContent!==label)$('presence').textContent=label;
 }catch(e){
  if(state.current?.id!==id||state.user!==user)return;
  if(e.status===404){state.accessLost=true;updatePermissions();showSaveError(new Error('Access was removed. Download any local draft to keep a copy.'));}
  $('presence').textContent=e.status===404?'Access removed':'Presence unavailable';
 }finally{presenceBusy=false;}
}
setInterval(()=>{heartbeat();if($('comments-dialog').open)loadComments(false).catch(()=>{});},10000);
document.addEventListener('visibilitychange',()=>{if(document.hidden)leavePresence();else heartbeat(true);});
window.addEventListener('pagehide',()=>{if(state.current)fetch('/api/documents/'+state.current.id+'/presence',{method:'DELETE',headers:{'content-type':'application/json','x-demo-user':state.user},body:JSON.stringify({session_id:presenceSession}),keepalive:true}).catch(()=>{});});

async function loadComments(show=true){
 if(!state.current)return;const id=state.current.id;const data=await api('/documents/'+id+'/comments');if(state.current?.id!==id)return;
 $('comment-count').textContent=data.comments.length||'';if(!show&&!$('comments-dialog').open)return;
 $('comments-list').replaceChildren();
 if(!data.comments.length)$('comments-list').append(element('p','empty-note','No comments yet. Leave the first useful thought.'));
 for(const c of data.comments){const item=element('article','comment');const head=element('div','comment-header');head.append(element('strong','',c.author_name),element('time','',new Date(c.created_at).toLocaleString()));
  if(canEdit()&&(c.author_id===state.user||state.current.owner_id===state.user)){const remove=element('button','','Remove');remove.setAttribute('aria-label','Remove comment by '+c.author_name);remove.addEventListener('click',async()=>{remove.disabled=true;try{await api('/documents/'+id+'/comments',{method:'DELETE',body:{id:c.id}});await loadComments();}catch(e){$('comments-error').textContent=e.message;remove.disabled=false;}});head.append(remove);}
  item.append(head,element('p','comment-text',c.body));$('comments-list').append(item);
 }
 updatePermissions();
}
$('trash-document').addEventListener('click',()=>guarded(async()=>{if(!state.current||state.current.owner_id!==state.user)return;if(!await save())return;$('trash-error').textContent='';$('trash-confirm').showModal();}));
$('cancel-trash').addEventListener('click',()=>$('trash-confirm').close());
$('confirm-trash').addEventListener('click',()=>guarded(async()=>{if(!state.current)return;const button=$('confirm-trash');button.disabled=true;try{await leavePresence();await api('/documents/'+state.current.id,{method:'DELETE'});$('trash-confirm').close();emptyEditor();await refreshList();if(state.docs.length)await openDoc(state.docs[0].id);notify('Moved to Trash. You can restore it from the documents menu.');}catch(e){$('trash-error').textContent=e.message;}finally{button.disabled=false;}}));
async function renderTrash(){const {documents}=await api('/trash');$('trash-list').replaceChildren();if(!documents.length)$('trash-list').append(element('p','empty-note','Trash is empty. Your ideas are all accounted for.'));
 for(const doc of documents){const row=element('div','trash-row');const text=element('div');text.append(element('strong','',doc.title),element('small','',new Date(doc.deleted_at).toLocaleString()));const button=element('button','button','Restore');button.setAttribute('aria-label','Restore '+doc.title);button.addEventListener('click',()=>guarded(async()=>{button.disabled=true;try{if(!await save())return;await api('/trash/'+doc.id+'/restore',{method:'POST'});await refreshList();await renderTrash();notify('Restored '+doc.title+'. Existing sharing access is restored.');}catch(e){$('trash-list-error').textContent=e.message;}finally{button.disabled=false;}}));row.append(text,button);$('trash-list').append(row);}
}
$('open-trash').addEventListener('click',()=>guarded(async()=>{$('trash-list-error').textContent='';await renderTrash();setDrawer(false);$('trash-dialog').showModal();}));
$('comments').addEventListener('click',()=>guarded(async()=>{if(!state.current)return;$('comments-error').textContent='';await loadComments();$('comments-dialog').showModal();}));
$('comment-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;$('comments-error').textContent='';try{await api('/documents/'+state.current.id+'/comments',{method:'POST',body:{body:$('comment-body').value}});$('comment-body').value='';await loadComments();}catch(error){$('comments-error').textContent=error.message;}finally{button.disabled=false;}});

async function showSnapshot(version){
 const {snapshot}=await api('/documents/'+state.current.id+'/versions/'+version);selectedSnapshot=snapshot;
 $('version-preview').replaceChildren();renderTree(snapshot.content,$('version-preview'));$('version-label').textContent='Version '+snapshot.version+' · '+snapshot.title;
 $('restore-version').disabled=!canEdit()||snapshot.version===state.current.version;
 for(const b of $('versions-list').children)b.setAttribute('aria-current',String(Number(b.dataset.version)===version));
}
$('history').addEventListener('click',()=>guarded(async()=>{
 if(!state.current)return;if(!await save()){notify('Resolve your draft before opening history.');return;}
 const {versions}=await api('/documents/'+state.current.id+'/versions');$('versions-list').replaceChildren();$('history-error').textContent='';
 for(const v of versions){const b=element('button','version-item');b.dataset.version=v.version;b.append(element('strong','','Version '+v.version+(v.version===state.current.version?' · current':'')),element('small','',(v.saved_by_name||'Baseline snapshot')+' · '+new Date(v.created_at).toLocaleString()));b.addEventListener('click',()=>showSnapshot(v.version).catch(e=>$('history-error').textContent=e.message));$('versions-list').append(b);}
 if(versions.length)await showSnapshot(versions[0].version);$('history-dialog').showModal();
}));
$('restore-version').addEventListener('click',()=>guarded(async()=>{
 if(!selectedSnapshot||!canEdit())return;if(!confirm('Restore version '+selectedSnapshot.version+' as a new saved version? Your current version stays in history.'))return;
 $('title').value=selectedSnapshot.title;$('editor').replaceChildren();renderTree(selectedSnapshot.content,$('editor'));changed();
 if(await save()){$('history-dialog').close();notify('Restored as version '+state.current.version+'. Previous versions are kept.');}
}));
$('export-html').addEventListener('click',()=>{exportDraft('html');$('export-dialog').close();});
$('export-markdown').addEventListener('click',()=>{exportDraft('markdown');$('export-dialog').close();});
$('export-pdf').addEventListener('click',()=>{$('export-dialog').close();window.print();});

start().catch(e=>{setSaved('Could not connect');notify(e.message+' Refresh to reconnect.');});

/* Lovable appearance controller, adapted to the requested Light/Dark-only control. */
(() => {
  'use strict';
  const KEY = 'folio-theme';
  const root = document.documentElement;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const valid = p => p === 'light' || p === 'dark';
  function read() { try { const p=localStorage.getItem(KEY);return valid(p)?p:'light'; } catch { return 'light'; } }
  let preference=read();
  function apply(p,animate=false) {
    preference=p;
    const update=()=>{
      if(p!==preference)return;
      root.dataset.theme=p;root.dataset.themePreference=p;
      document.getElementById('theme-color').content=p==='dark'?'#1d2020':'#fffdf8';
      for(const input of document.querySelectorAll('#theme-switch input[name="theme"]'))input.checked=input.value===p;
    };
    if(animate&&root.dataset.theme!==p&&typeof document.startViewTransition==='function'&&!reduce?.matches){
      // Skip old animations; callbacks for superseded choices do nothing.
      if(transition)transition.skipTransition();
      transition=document.startViewTransition(update);
    }else update();
  }
  let transition=null;
  function set(p){if(!valid(p))return;try{localStorage.setItem(KEY,p);}catch{}apply(p,true);}
  document.addEventListener('change',e=>{const t=e.target;if(t instanceof HTMLInputElement&&t.name==='theme'&&t.closest('#theme-switch')&&t.checked)set(t.value);});
  window.addEventListener('storage',e=>{if(e.key===KEY||e.key===null)apply(read());});
  apply(preference);
  const ready=()=>document.getElementById('theme-switch')?.classList.add('is-ready');
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>requestAnimationFrame(ready));else ready();
  window.FolioTheme={get:()=>preference,set,resolved:()=>root.dataset.theme};
})();
