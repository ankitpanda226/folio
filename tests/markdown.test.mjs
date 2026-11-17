import {test} from 'node:test';import assert from 'node:assert/strict';import {toMarkdown} from '../app/markdown.js';
const n=(type,...children)=>({type,children});
test('Markdown preserves headings, inline formatting, quotes and Unicode',()=>{assert.equal(toMarkdown([n('h2','Plan'),n('p',n('strong','Bold'),' and ',n('em','italic'),' ',n('u','underlined')),n('blockquote','A useful thought — together.')]),'## Plan\n\n**Bold** and *italic* <u>underlined</u>\n\n> A useful thought — together.\n');});
test('Nested lists retain hierarchy and ordered markers',()=>{assert.equal(toMarkdown([n('ul',n('li','Parent',n('ol',n('li','First'),n('li','Second'))),n('li','Sibling'))]),'- Parent\n  1. First\n  2. Second\n- Sibling\n');});
test('Literal formatting and active HTML are escaped',()=>{assert.equal(toMarkdown([n('p','<script>alert(1)</script> *literal*'),n('p','# Not a heading')]),'\\<script\\>alert(1)\\</script\\> \\*literal\\*\n\n\\# Not a heading\n');});

test('Extended document blocks export with stable Markdown structure',()=>{
 const tree=[{type:'h4',children:['Details']},{type:'aside',children:[{type:'p',children:['A useful note']}]},{type:'hr',children:[]},{type:'pre',children:['const x = `value`;']},{type:'p',children:[{type:'s',children:['old']},' ',{type:'mark',children:['key']},' ✓']}];
 const result=toMarkdown(tree);
 assert.match(result,/#### Details/);assert.match(result,/> A useful note/);assert.match(result,/\n---\n/);assert.match(result,/```\nconst x = `value`;\n```/);assert.match(result,/~~old~~ <mark>key<\/mark> ✓/);
});
