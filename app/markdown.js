// Pure converter shared by browser export and Node tests. Underline uses inline HTML.
export function toMarkdown(nodes) {
 const text=s=>s.replace(/([\\`*_{}\[\]<>])/g,'\\$1').replace(/^(\s*)(#{1,6}|[-+]|\d+\.)\s/gm,'$1\\$2 ');
 function render(n){
  if(typeof n==='string')return text(n);
  if(!n)return '';
  if(n.type==='hr')return '\n---\n\n';
  if(n.type==='pre'){const plain=n=>typeof n==='string'?n:n.type==='br'?'\n':(n.children||[]).map(plain).join('');const content=plain(n);const fence='`'.repeat(Math.max(3,...(content.match(/`+/g)||[]).map(s=>s.length+1)));return fence+'\n'+content+'\n'+fence+'\n\n';}
  if(n.type==='ul'||n.type==='ol')return '\n'+n.children.filter(c=>typeof c!=='string').map((li,i)=>{
   const marker=n.type==='ol'?`${i+1}. `:'- ',lines=li.children.map(render).join('').trim().split('\n');
   return marker+lines.map((line,j)=>j&&line?' '.repeat(marker.length)+line:line).join('\n');
  }).join('\n')+'\n\n';
  const inner=(n.children||[]).map(render).join('');
  if(['strong','b'].includes(n.type))return '**'+inner+'**';
  if(['em','i'].includes(n.type))return '*'+inner+'*';
  if(n.type==='s')return '~~'+inner+'~~';
  if(['mark','sub','sup'].includes(n.type))return '<'+n.type+'>'+inner+'</'+n.type+'>';
  if(n.type==='code')return '<code>'+inner+'</code>';
  if(n.type==='u')return '<u>'+inner+'</u>';
  if(n.type==='br')return '  \n';
  if(/^h[1234]$/.test(n.type))return '#'.repeat(Number(n.type[1]))+' '+inner.trim()+'\n\n';
  if(n.type==='blockquote'||n.type==='aside')return inner.trim().split('\n').map(line=>'> '+line).join('\n')+'\n\n';
  if(['p','div'].includes(n.type))return inner.trim()+'\n\n';
  return inner;
 }
 return nodes.map(render).join('').replace(/\n{3,}/g,'\n\n').trim()+'\n';
}
