import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync('markdown-editor.html', 'utf8');
const i18n = readFileSync('i18n.js', 'utf8');

test('standalone HTML editor and companion i18n.js exist', () => {
  assert.match(html, /<textarea id="editor"/);
  assert.doesNotMatch(html, /<textarea id="preview-source"/);
  assert.match(html, /<script src="i18n\.js"><\/script>/);
});

test('import and export preserve Markdown as plain text', () => {
  assert.match(html, /reader\.readAsText\(file\)/);
  assert.match(html, /new Blob\(\[.*\], \{ type: 'text\/markdown;charset=utf-8' \}\)/);
  assert.match(html, /function autoSave\(\)/);
});

test('both image insertion paths remain available', () => {
  assert.match(html, /reader\.readAsDataURL\(file\)/);
  assert.match(html, /function insertImageMarkdown\(alt, url\)/);
  assert.match(html, /function handleImageFileSelect\(input\)/);
});

test('translations remain available in all 10 existing languages', () => {
  for (const lang of ['zh-CN','zh-TW','en','ja','ko','es','fr','de','ru','pt']) {
    assert.ok(i18n.includes("'"+lang+"': {"), lang);
  }
});

test('no npm toolchain or added runtime dependencies', () => {
  assert.equal(existsSync('package.json'), false);
  assert.equal(existsSync('node_modules'), false);
});


import vm from 'node:vm';

function foldingHarness() {
  const block = html.match(/\/\/ Base64 folding BEGIN([\s\S]*?)\/\/ Base64 folding END/);
  assert.ok(block, 'folding helpers must exist in inline JavaScript');
  const makeTextarea = () => ({
    value: '', selectionStart: 0, selectionEnd: 0,
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  });
  const editor = makeTextarea();
  const button = { textContent: '', title: '', setAttribute() {} };
  const context = vm.createContext({
    editor,
    document: { getElementById() { return button; } },
    getActiveEditor() { return editor; },
    updatePreview() {}, updateCount() {}, showToast() {}, t: key => key
  });
  vm.runInContext(block[1] + '\nthis.api = {collapseImageData, expandImageData, getMarkdown, setMarkdown, toggleBase64, collapseTextareaData, copyExpandedBase64};', context);
  return { api: context.api, editor };
}

test('Base64 images fold to markers, expand to exact original data, and keep external links', () => {
  const {api} = foldingHarness();
  const payload = 'A'.repeat(512);
  const raw = 'intro\n![one](data:image/png;base64,' + payload + ')\n![two](data:image/jpeg;base64,' + payload + ')\n![url](https://example.com/image.png)\nend';
  const folded = api.collapseImageData(raw);
  assert.ok(folded.text.length < raw.length / 2);
  assert.match(folded.text, /⟦Base64图片#\d+已折叠⟧/);
  assert.ok(folded.text.includes('https://example.com/image.png'));
  assert.equal(api.expandImageData(folded.text), raw);
  assert.equal(folded.position(raw.length), folded.text.length);
});

test('save and editing use full Markdown even while Base64 is hidden; toggling is lossless', () => {
  const {api, editor} = foldingHarness();
  const raw = 'hello\n![photo](data:image/webp;base64,' + 'Z'.repeat(700) + ')\nworld';
  api.setMarkdown(raw);
  assert.equal(api.getMarkdown(), raw);
  assert.ok(editor.value.length < raw.length);
  editor.selectionStart = editor.selectionEnd = editor.value.length;
  api.toggleBase64();
  assert.equal(editor.value, raw);
  assert.equal(editor.selectionStart, raw.length);
  api.toggleBase64();
  assert.equal(api.getMarkdown(), raw);
  assert.equal(editor.selectionStart, editor.value.length);
});

test('pasting data URLs into a folded textarea preserves cursor and complete image', () => {
  const {api, editor} = foldingHarness();
  const payload = 'A'.repeat(256);
  const raw = 'prefix ![x](data:image/gif;base64,' + payload + ') suffix';
  editor.value = raw;
  editor.selectionStart = editor.selectionEnd = raw.length;
  api.collapseTextareaData(editor);
  assert.equal(api.getMarkdown(), raw);
  assert.equal(editor.selectionStart, editor.value.length);
});

test('small data and ordinary Markdown remain unchanged', () => {
  const {api} = foldingHarness();
  const raw = '![tiny](data:image/png;base64,AAAA)\n![url](https://example.com)';
  assert.equal(api.collapseImageData(raw).text, raw);
});

test('right pane is preview-only with no source-mode runtime', () => {
  for (const dead of ['previewMode', 'previewSource', 'PREVIEW_MODE_KEY', 'setPreviewMode', 'getActiveEditor', 'syncEditorFromActive']) {
    assert.equal(html.includes(dead), false, dead);
  }
  assert.doesNotMatch(html, /class="preview-toggle"/);
  assert.match(html, /<div class="preview-content" id="preview"><\/div>/);
  assert.match(html, /function exportPDF\(\) \{/);
  assert.match(html, /function openExportImageModal\(\) \{/);
});

test('copying hidden Base64 transfers complete Markdown, not a placeholder', () => {
  const {api, editor} = foldingHarness();
  const raw = '![photo](data:image/png;base64,' + 'T'.repeat(256) + ')';
  api.setMarkdown(raw);
  editor.selectionStart = 0;
  editor.selectionEnd = editor.value.length;
  let copied = '', prevented = false;
  api.copyExpandedBase64({
    currentTarget: editor,
    clipboardData: { setData(type, data) { assert.equal(type, 'text/plain'); copied = data; } },
    preventDefault() { prevented = true; }
  });
  assert.equal(copied, raw);
  assert.ok(prevented);
});

test('editable filename fills top bar and original brand label is removed', () => {
  assert.doesNotMatch(html, /class="brand"/);
  assert.doesNotMatch(html, /class="spacer"/);
  assert.match(html, /\.top-bar input\[type="text"\] \{[\s\S]*?flex: 1 1 260px/);
  const header = html.match(/<div class="top-bar">([\s\S]*?)<div class="top-actions">/);
  assert.ok(header);
  assert.match(header[1], /id="filename"/);
});

test('filename edits and imports synchronize browser tab title', () => {
  const fn = html.match(/function syncDocumentTitle\(\) \{[\s\S]*?\n    \}/);
  assert.ok(fn);
  const ctx = { filenameInput:{value:'Example.md'}, document:{title:'before'}, t:()=>'Untitled.md' };
  vm.runInNewContext(fn[0] + '\nsyncDocumentTitle();', ctx);
  assert.equal(ctx.document.title, 'Example.md');
  ctx.filenameInput.value = 'Updated.md';
  vm.runInNewContext('syncDocumentTitle();', ctx);
  assert.equal(ctx.document.title, 'Updated.md');
  ctx.filenameInput.value = '';
  vm.runInNewContext('syncDocumentTitle();', ctx);
  assert.equal(ctx.document.title, 'Untitled.md');
  assert.match(html, /filenameInput\.addEventListener\('input', \(\) => \{\s*syncDocumentTitle\(\);/);
  assert.match(html, /filenameInput\.value = name;\s*syncDocumentTitle\(\);/);
  assert.match(html, /function applyLanguage\(\) \{[\s\S]*?syncDocumentTitle\(\);/);
});

test('left-only Base64 control is beside Edit and leaves full Markdown for preview', () => {
  const left = html.match(/<div class="pane editor-pane">([\s\S]*?)<div class="resizer"/);
  const right = html.match(/<div class="pane preview-pane">([\s\S]*?)<div class="statusbar"/);
  assert.ok(left && right);
  assert.match(left[1], /data-i18n="editorPaneTitle"[\s\S]*?id="base64-toggle"/);
  assert.doesNotMatch(right[1], /base64-toggle|<textarea/);
  assert.match(html, /function updatePreview\(\) \{\s*let text = getMarkdown\(\);/);
  const toggle = html.match(/function toggleBase64\(\) \{([\s\S]*?)\n    \}/);
  assert.ok(toggle);
  assert.doesNotMatch(toggle[1], /updatePreview\(|updateCount\(|preview\./);
  const {api,editor} = foldingHarness();
  const raw = '![photo](data:image/png;base64,' + 'Q'.repeat(500) + ')';
  api.setMarkdown(raw);
  const hidden = editor.value;
  api.toggleBase64();
  assert.equal(api.getMarkdown(), raw);
  api.toggleBase64();
  assert.match(editor.value, /⟦Base64图片#\d+已折叠⟧/);
  assert.equal(editor.value.length, hidden.length);
  assert.equal(api.getMarkdown(), raw);
});

test('counter counts rendered text, not Markdown syntax, image alt text or Base64', () => {
  const body = html.match(/function updateCount\(\) \{[\s\S]*?\n    \}/);
  assert.ok(body, 'counter function must exist');
  const count = (renderedText, markedLoaded = true) => {
    const context = {
      preview: { innerText: renderedText },
      wordCount: { textContent: '' },
      t: (_, count) => String(count),
      ...(markedLoaded ? { marked: {} } : {})
    };
    vm.runInNewContext(body[0] + '\nupdateCount();', context);
    return Number(context.wordCount.textContent);
  };
  assert.equal(count(''), 0);
  assert.equal(count('Hello **world**'.replace(/\*\*/g, '')), 10);
  assert.equal(count('一级标题\n加粗链接'), 8);
  assert.equal(count('你好 🌟'), 3);
  assert.equal(count('正文'), 2); // an image adds no text nodes
  assert.equal(count('正文图片后的文字'), 8);
  const image = 'A'.repeat(500000);
  assert.equal(count('正文 ![图片替代文本](data:image/png;base64,' + image + ')', false), 2);
  assert.equal(count('![external](https://example.com/pic.png)', false), 0);
});

test('public directory and image references are completely removed from both READMEs', () => {
  assert.equal(existsSync('public'), false);
  for (const filename of ['README.md', 'README.zh.md']) {
    const readme = readFileSync(filename, 'utf8');
    assert.doesNotMatch(readme, /public\//, filename);
    assert.doesNotMatch(readme, /<img\b/i, filename);
  }
});

test('outline extracts headings from Markdown without preview-source mode', () => {
  const block = html.match(/function extractHeadings\(text\) \{[\s\S]*?\n    \}/);
  assert.ok(block);
  const ctx = vm.createContext({});
  vm.runInContext(block[0] + '\nthis.extract = extractHeadings;', ctx);
  const fence = String.fromCharCode(96).repeat(3);
  const result = ctx.extract('# First\n' + fence + '\n## Hidden\n' + fence + '\n## Second\n~~~\n# Hidden2\n~~~');
  assert.deepEqual(Array.from(result, h => [h.level, h.text, h.line]), [[1,'First',0],[2,'Second',4]]);
  assert.match(html, /extractHeadings\(getMarkdown\(\)\)/);
  assert.doesNotMatch(html, /previewSource|setPreviewMode|PREVIEW_MODE_KEY/);
});
test('outline panel persists visibility and width with ten-language labels', () => {
  for (const key of ['outline-pane', 'outline-resizer', 'outline-collapse-btn', 'OUTLINE_VISIBLE_KEY', 'OUTLINE_WIDTH_KEY', 'jumpToHeading', 'scrollTextareaToCaret']) {
    assert.ok(html.includes(key), key);
  }
  for (const key of ['outlineTitle', 'viewStandard', 'outlineEmpty', 'collapseOutline', 'expandOutline']) {
    assert.equal((i18n.match(new RegExp('^    '+key+':', 'gm')) || []).length, 10, key);
  }
});
test('Mermaid SVG labels are counted and the count refreshes after render promise', () => {
  const block = html.match(/function updateCount\(\) \{[\s\S]*?\n    \}/);
  assert.ok(block);
  const svg = { querySelectorAll() { return [{textContent:'开始'}, {textContent:'结束'}]; } };
  const preview = {innerText:'正文 graph TD', querySelectorAll() {return [{innerText:'graph TD',querySelector(){return svg;}}];}};
  const ctx = {preview,marked:{},wordCount:{textContent:''},t:(_,c)=>String(c)};
  vm.runInNewContext(block[0] + '\nupdateCount();', ctx);
  assert.equal(ctx.wordCount.textContent, '6');
  assert.match(html, /Promise\.resolve\(mermaid\.run\(/);
});

test('code-block toolbar always inserts a fenced block, with an editable body', () => {
  const block = html.match(/function insertCode\(\) \{[\s\S]*?\n    \}/);
  assert.ok(block);
  function insert(text, from, to) {
    const editor = {
      value:text, selectionStart:from, selectionEnd:to,
      setRangeText(value,start,end){this.value=this.value.slice(0,start)+value+this.value.slice(end);},
      setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},
      focus(){}
    };
    vm.runInNewContext(block[0]+'\ninsertCode();', {
      editor, pushHistory(){}, updatePreview(){}, updateCount(){}, autoSave(){}
    });
    return editor;
  }
  const fence = String.fromCharCode(96).repeat(3);
  const blank = insert('',0,0);
  assert.equal(blank.value,fence+'code\n\n'+fence);
  assert.equal(blank.selectionStart,8);
  const single = insert('abc',0,3);
  assert.equal(single.value,fence+'code\nabc\n'+fence);
  assert.equal(single.value.slice(single.selectionStart,single.selectionEnd),'abc');
  const multi = insert('one\ntwo',0,7);
  assert.equal(multi.value,fence+'code\none\ntwo\n'+fence);
  const inline = insert('hello world',6,11);
  assert.equal(inline.value,'hello \n'+fence+'code\nworld\n'+fence);
  const middle = insert('ABCDEF',3,3);
  assert.equal(middle.value,'ABC\n'+fence+'code\n\n'+fence+'\nDEF');
  assert.match(html,/onclick="insertCode\(\)"[^>]*>[\s\S]*?data-i18n="codeBlock">代码块<\/span>/);
});

test('Standard layout shows editor, preview and outline, preserving their separate fold controls', () => {
  const menu=html.match(/<div class="dropdown-menu" id="view-menu">([\s\S]*?)<\/div>/);
  assert.ok(menu);
  assert.match(menu[1],/setLayoutMode\('standard'\)/);
  assert.doesNotMatch(menu[1],/setLayoutMode\('both'|'edit'|'preview'\)|toggleOutline\(\)/);
  assert.doesNotMatch(html,/preview-collapse-btn|previewCollapsed|PREVIEW_COLLAPSED_KEY|LAYOUT_MODE_KEY/);
  const block=html.match(/function setLayoutMode\(mode\) \{[\s\S]*?\n    \}/);
  assert.ok(block);
  const stored={};
  let paneUpdates=0, outlineUpdates=0, outlineRenders=0;
  const ctx={
    editorCollapsed:true, outlineVisible:false,
    EDITOR_COLLAPSED_KEY:'editor',OUTLINE_VISIBLE_KEY:'outline',
    localStorage:{setItem(k,v){stored[k]=v;}},
    applyPaneStates(){paneUpdates++;},
    applyOutlineState(){outlineUpdates++;},
    renderOutline(){outlineRenders++;}
  };
  vm.runInNewContext(block[0]+"\nsetLayoutMode('standard');",ctx);
  assert.equal(ctx.editorCollapsed,false);
  assert.equal(ctx.outlineVisible,true);
  assert.deepEqual(stored,{editor:'false',outline:'true'});
  assert.equal(paneUpdates,1);
  assert.equal(outlineUpdates,1);
  assert.equal(outlineRenders,1);
  assert.match(html,/outlineVisible = localStorage\.getItem\(OUTLINE_VISIBLE_KEY\) !== 'false'/);
});

test('outline collapse arrow moves to the left, switches direction and preserves width', () => {
  const paneHeader=html.match(/<div class="pane outline-pane" id="outline-pane">([\s\S]*?)<div class="outline-list"/);
  assert.ok(paneHeader);
  assert.match(paneHeader[1],/id="outline-collapse-btn"[\s\S]*?icon-chevron-left/);
  assert.match(html,/\.outline-pane\.collapsed \.outline-list \{ display: none; \}/);
  assert.match(html,/\.outline-pane \.pane-header > \.collapse-btn \{ position: absolute; left: 12px; \}/);
  const block=html.match(/function applyOutlineState\(\) \{[\s\S]*?\n    \}/);
  assert.ok(block);
  const classList=()=>({states:{},toggle(key,on){this.states[key]=on;}});
  const pane={classList:classList(),style:{}};
  const resizer={classList:classList()};
  const button={attributes:{},setAttribute(k,v){this.attributes[k]=v;}};
  const elements={'outline-pane':pane,'outline-resizer':resizer,'outline-collapse-btn':button};
  const ctx={
    outlineVisible:true,outlineWidth:320,readingMode:false,
    document:{getElementById(id){return elements[id];}},
    t:key=>key,applySplit(){}
  };
  vm.runInNewContext(block[0]+'\nthis.syncOutline = applyOutlineState;',ctx);
  ctx.syncOutline();
  assert.equal(pane.style.flex,'0 0 320px');
  assert.equal(pane.classList.states.collapsed,false);
  assert.match(button.innerHTML,/icon-chevron-left/);
  assert.equal(button.attributes['aria-expanded'],'true');
  ctx.outlineVisible=false;
  ctx.syncOutline();
  assert.equal(pane.style.flex,'');
  assert.equal(pane.classList.states.collapsed,true);
  assert.equal(resizer.classList.states.hidden,true);
  assert.match(button.innerHTML,/icon-chevron-right/);
  assert.equal(button.attributes['aria-expanded'],'false');
  assert.match(html,/localStorage\.setItem\(OUTLINE_WIDTH_KEY, outlineWidth\)/);
});

test('ten languages use Standard and expanded outline titles without obsolete view options', () => {
  for(const key of ['viewStandard','expandOutline','collapseOutline']) {
    assert.equal((i18n.match(new RegExp('^    '+key+':','gm'))||[]).length,10,key);
  }
  for(const old of ['viewBoth','viewEdit','viewPreview','viewOutline','collapsePreview','expandPreview']) {
    assert.doesNotMatch(i18n,new RegExp('^    '+old+':','m'),old);
  }
  assert.match(html,/\.editor-toolbar button span\[data-i18n="codeBlock"\] \{ display: inline; \}/);
});
