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
  const menu=html.match(/<div class="dropdown-menu" id="view-menu">([\s\S]*?)<\/div>\s*<\/div>/);
  assert.ok(menu);
  assert.doesNotMatch(menu[1],/setLayoutMode\('standard'\)/);
  assert.match(html,/function setLayoutMode\(mode\) \{/);
  assert.doesNotMatch(menu[1],/setLayoutMode\('both'|'edit'|'preview'\)|toggleOutline\(\)/);
  assert.doesNotMatch(html,/preview-collapse-btn|previewCollapsed|PREVIEW_COLLAPSED_KEY|LAYOUT_MODE_KEY/);
  const block=html.match(/function setLayoutMode\(mode\) \{[\s\S]*?\n    \}/);
  assert.ok(block);
  const stored={};
  let paneUpdates=0, outlineUpdates=0, outlineRenders=0;
  const ctx={
    editorCollapsed:true, outlineVisible:false, readingMode:false,
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

test('Reading mode hides editing chrome and replaces Page Fullscreen', () => {
  const menu=html.match(/<div class="dropdown-menu" id="view-menu">([\s\S]*?)<\/div>\s*<\/div>/);
  assert.ok(menu);
  assert.match(menu[1],/setReadingMode\(true\)/);
  assert.match(menu[1],/data-i18n="readingMode"/);
  assert.doesNotMatch(menu[1],/pageFullscreen|PageFullscreen/);
  for(const obsolete of ['togglePageFullscreen','PAGE_FULLSCREEN_KEY','.app.page-fullscreen','page-fullscreen-active']) {
    assert.equal(html.includes(obsolete),false,obsolete);
  }
  for(const hidden of ['.top-bar','.editor-toolbar','.statusbar','.editor-pane','#resizer','#outline-resizer','.preview-pane .pane-header']) {
    assert.ok(html.includes('.app.reading-mode '+hidden),hidden);
  }
  assert.match(html,/\.app\.reading-mode \.main \{ flex-direction: row; \}/);
  assert.match(html,/\.app\.reading-mode \.outline-pane \{\s*position: absolute;/);
  assert.match(html,/id="reading-exit-btn" onclick="setReadingMode\(false\)"/);
  assert.match(html,/event\.key === 'Escape'\) setReadingMode\(false\)/);
  assert.equal(existsSync('package.json'),false);
});

test('Reading mode toggle preserves the previous standard editor and outline states', () => {
  const apply=html.match(/function applyReadingMode\(\) \{[\s\S]*?\n    \}/);
  const setter=html.match(/function setReadingMode\(enabled\) \{[\s\S]*?\n    \}/);
  assert.ok(apply&&setter);
  const app={active:false,classList:{toggle(key,state){assert.equal(key,'reading-mode');app.active=state;}}};
  const pane={style:{left:'',top:'',width:''}};
  const saved={};
  const ctx={
    readingMode:false,editorCollapsed:true,outlineVisible:false,
    READING_MODE_KEY:'read',
    document:{querySelector(){return app;},getElementById(){return pane;}},
    localStorage:{setItem(k,v){saved[k]=v;}},
    applyOutlineState(){},positionReadingOutline(){pane.style.left='15px';},
    renderOutline(){},endReadingOutlineDrag(){}
  };
  vm.runInNewContext(apply[0]+'\n'+setter[0]+'\nthis.setRead=setReadingMode;',ctx);
  ctx.setRead(true);
  assert.equal(app.active,true);
  assert.equal(saved.read,'true');
  assert.equal(ctx.editorCollapsed,true);
  assert.equal(ctx.outlineVisible,false);
  ctx.setRead(false);
  assert.equal(app.active,false);
  assert.equal(saved.read,'false');
  assert.equal(pane.style.left,'');
  assert.equal(ctx.editorCollapsed,true);
  assert.equal(ctx.outlineVisible,false);
});

test('Reading outline position clamps to window and responds to resize', () => {
  const block=html.match(/function clampReadingOutlinePosition\(left, top, paneWidth, paneHeight, areaWidth, areaHeight\) \{[\s\S]*?\n    \}/);
  assert.ok(block);
  const ctx={};
  vm.runInNewContext(block[0]+'\nthis.clamp=clampReadingOutlinePosition;',ctx);
  assert.equal(ctx.clamp(2500,1900,230,300,1200,800).left,970);
  assert.equal(ctx.clamp(2500,1900,230,300,1200,800).top,500);
  assert.equal(ctx.clamp(-20,-90,230,300,1200,800).left,0);
  assert.equal(ctx.clamp(-20,-90,230,300,1200,800).top,0);
  assert.equal(ctx.clamp(20,50,300,400,200,100).top,0);
  assert.equal(ctx.clamp(20,50,300,400,200,100).left,0);
  assert.match(html,/window\.addEventListener\('resize', \(\) => \{ if \(readingMode\) positionReadingOutline\(\); \}\)/);
});

test('Reading outline drag uses pointer events and remembers the bounded position', () => {
  const names=['clampReadingOutlinePosition','beginReadingOutlineDrag','moveReadingOutlineDrag','endReadingOutlineDrag'];
  const source=names.map(name=>{
    const fn=html.match(new RegExp('function '+name+'\\([^\\n]+\\) \\{[\\s\\S]*?\\n    \\}'));
    assert.ok(fn,name);return fn[0];
  }).join('\n');
  const pane={offsetLeft:60,offsetTop:45,offsetWidth:250,offsetHeight:200,style:{}};
  const main={clientWidth:500,clientHeight:400};
  const header={setPointerCapture(){},hasPointerCapture(){return false;}};
  let stored=null;
  const ctx={
    readingMode:true,readingDrag:null,readingOutlinePosition:null,
    READING_OUTLINE_POS_KEY:'position',
    document:{getElementById(){return pane;},querySelector(q){return q==='.main'?main:header;}},
    localStorage:{setItem(k,v){assert.equal(k,'position');stored=JSON.parse(v);}},JSON
  };
  vm.runInNewContext(source+'\nthis.start=beginReadingOutlineDrag;this.move=moveReadingOutlineDrag;this.finish=endReadingOutlineDrag;',ctx);
  ctx.start({button:0,pointerId:7,clientX:100,clientY:100,target:{closest(){return null;}},preventDefault(){}});
  ctx.move({pointerId:7,clientX:999,clientY:999,preventDefault(){}});
  assert.equal(pane.style.left,'250px');
  assert.equal(pane.style.top,'200px');
  ctx.finish({pointerId:7});
  assert.equal(stored.left,250);
  assert.equal(stored.top,200);
  assert.equal(ctx.readingDrag,null);
  assert.match(html,/window\.addEventListener\('pointermove', moveReadingOutlineDrag\)/);
  assert.match(html,/window\.addEventListener\('pointercancel', endReadingOutlineDrag\)/);
});

test('Reading mode translations, refresh restore and outline navigation remain functional', () => {
  for(const key of ['readingMode','exitReadingMode']) {
    assert.equal((i18n.match(new RegExp('^    '+key+':','gm'))||[]).length,10,key);
  }
  assert.doesNotMatch(i18n,/^    pageFullscreen:|^    toastPageFullscreen(?:On|Off):/m);
  assert.match(html,/readingMode = localStorage\.getItem\(READING_MODE_KEY\) === 'true'/);
  assert.match(html,/localStorage\.getItem\(READING_OUTLINE_POS_KEY\)/);
  assert.match(html,/if \(!outlineVisible && !readingMode\) return;/);
  assert.match(html,/if \(!readingMode\) target\.focus\(\)/);
  assert.match(html,/const editorTop = readingMode \? null : scrollTextareaToCaret\(target, true\)/);
});


test('preview header centers the title beside a blue word count', () => {
  const section = html.match(/<div class="pane preview-pane">([\s\S]*?)<div class="preview-content"/);
  assert.ok(section);
  assert.match(section[1], /class="preview-title-group"[\s\S]*?data-i18n="previewPaneTitle"[\s\S]*?id="word-count"/);
  assert.match(html, /\.preview-pane \.pane-header \{ justify-content: center; \}/);
  assert.match(html, /\.preview-title-group \{[^}]*gap: 10px/);
  assert.match(html, /#word-count \{ color: #2563eb;/);
  assert.match(html, /\[data-theme="dark"\] #word-count \{ color: #60a5fa;/);
  assert.match(html, /\.app\.reading-mode \.preview-pane \.pane-header \{ display: none !important; \}/);
});

test('document timestamp shows HTML opening time, then successful Markdown import time', () => {
  assert.match(html, /<time id="document-time" aria-live="polite"><\/time>/);
  assert.doesNotMatch(html, /id="file-path"|filePathInput|setFilePath|FILE_PATH_KEY/);
  const formatter=html.match(/function formatDocumentTime\(date\) \{[\s\S]*?\n    \}/);
  const render=html.match(/function updateDocumentTime\(\) \{[\s\S]*?\n    \}/);
  const setter=html.match(/function setDocumentImportTime\(isMarkdown\) \{[\s\S]*?\n    \}/);
  assert.ok(formatter && render && setter);
  const fakeDate=(year,month,day,hour,minute,second)=>({
    getFullYear(){return year;},getMonth(){return month - 1;},
    getDate(){return day;},getHours(){return hour;},
    getMinutes(){return minute;},getSeconds(){return second;},
    toISOString(){return year+'-ISO';}
  });
  const opened=fakeDate(2026,10,30,11,53,7);
  const imported=fakeDate(2026,10,30,12,8,9);
  const time={textContent:'',title:'',dateTime:''};
  const ctx={
    documentTime:time,htmlOpenedAt:opened,markdownImportedAt:null,
    t:(key,value)=>key+':'+value,
    Date:function(){return imported;}
  };
  vm.runInNewContext(formatter[0]+'\n'+render[0]+'\n'+setter[0]+
    '\nthis.update=updateDocumentTime;this.setImport=setDocumentImportTime;',ctx);
  ctx.update();
  assert.equal(time.textContent,'openTime:2026-10-30 11:53:07');
  assert.equal(time.dateTime,'2026-ISO');
  ctx.setImport(true);
  assert.equal(time.textContent,'importTime:2026-10-30 12:08:09');
  ctx.setImport(false);
  assert.equal(time.textContent,'openTime:2026-10-30 11:53:07');
  assert.match(html,/setDocumentImportTime\(\/\\\.\(md\|markdown\)\$\/i\.test\(file\.name\)\)/);
  assert.match(html,/if \(confirm\(t\('confirmClear'\)\)\) \{\s*setDocumentImportTime\(false\)/);
  assert.match(html,/function applyLanguage\(\) \{[\s\S]*?updateDocumentTime\(\);/);
  assert.doesNotMatch(html,/localStorage\.setItem\(FILE_PATH_KEY/);
  for (const key of ['openTime','importTime']) {
    assert.equal((i18n.match(new RegExp('^    '+key+':','gm'))||[]).length,10,key);
  }
});

test('language and Help exchange places, Standard disappears from UI only', () => {
  const header=html.match(/<div class="top-actions">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="editor-toolbar">/);
  assert.ok(header);
  const area=header[1];
  const language=area.indexOf('id="lang-dropdown"');
  const help=area.indexOf('onclick="openHelp()"');
  const clear=area.indexOf('onclick="clearDoc()"');
  assert.ok(language>0 && language<clear && clear<help);
  const view=html.match(/<div class="dropdown-menu" id="view-menu">([\s\S]*?)<\/div>\s*<\/div>/);
  assert.ok(view);
  assert.doesNotMatch(view[1],/setLayoutMode\('standard'\)|data-i18n="viewStandard"/);
  assert.match(view[1],/setReadingMode\(true\)/);
  assert.match(view[1],/toggleFullscreen\(\)/);
  assert.match(html,/function setLayoutMode\(mode\) \{/);
  assert.equal((i18n.match(/^    viewStandard:/gm)||[]).length,10);
});

test('missing scroll-sync suppression helper exists and prevents navigation interference', () => {
  const suppress=html.match(/function suppressScrollSync\(duration\) \{[\s\S]*?\n    \}/);
  const sync=html.match(/function syncScroll\(source, target\) \{[\s\S]*?\n    \}/);
  assert.ok(suppress && sync);
  const ctx={isSyncingScroll:false,outlineNavigationActive:false,now:500,Date:{now(){return ctx.now;}}};
  vm.runInNewContext('let syncSuppressUntil=0;\n'+suppress[0]+'\n'+sync[0]+
    '\nthis.suppress=suppressScrollSync;this.sync=syncScroll;',ctx);
  const source={scrollHeight:500,clientHeight:100,scrollTop:150};
  const dest={scrollHeight:400,clientHeight:100,scrollTop:0};
  ctx.suppress(1200);
  ctx.sync(source,dest);
  assert.equal(dest.scrollTop,0);
  ctx.now=1701;
  ctx.sync(source,dest);
  assert.equal(dest.scrollTop,112.5);
});

test('outline jumps to the correct heading level and scrolls only the preview to its top', () => {
  const fn=html.match(/function jumpToHeading\(index\) \{[\s\S]*?\n    \}/);
  assert.ok(fn);
  const outlineHeadings=[
    {level:1,line:0,text:'Top'},
    {level:2,line:1,text:'First'},
    {level:3,line:2,text:'Nested'},
    {level:2,line:3,text:'Second'}
  ];
  const body={style:{}};
  const first={getBoundingClientRect(){return {top:220,height:40};}};
  const second={getBoundingClientRect(){return {top:750,height:40};}};
  const preview={
    scrollTop:50,clientTop:0,clientHeight:300,scrollHeight:800,
    getBoundingClientRect(){return {top:100};},
    querySelectorAll(selector) {
      assert.equal(selector,'.markdown-body h2');
      return [first,second];
    },
    querySelector(selector) {assert.equal(selector,'.markdown-body');return body;},
    scrollTo(options){this.scrolled=options;}
  };
  const editor={
    value:'',selectionStart:0,
    setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;},
    focus(){throw Error('reading mode must not focus the editor');}
  };
  const ctx={
    outlineHeadings,readingMode:true,editor,preview,imageDataCollapsed:false,
    getMarkdown(){return '# Top\n## First\n### Nested\n## Second';},
    suppressScrollSync(duration){ctx.suppressed=duration;},
    waitForOutlineNavigation(editorTop,previewTop){ctx.waited=[editorTop,previewTop];},
    document:{querySelectorAll(){return Array.from({length:4},()=>({classList:{toggle(){}}}));}},
    getComputedStyle(){return {paddingBottom:'32px'};}
  };
  vm.runInNewContext(fn[0]+'\njumpToHeading(3);',ctx);
  assert.equal(preview.scrolled.top,700);
  assert.equal(preview.scrolled.behavior,'smooth');
  assert.equal(body.style.paddingBottom,'234px');
  assert.equal(editor.selectionStart,'# Top\n## First\n### Nested\n'.length);
  assert.equal(ctx.suppressed,1400);
  assert.equal(ctx.waited[0],null);
  assert.equal(ctx.waited[1],700);
  assert.equal(ctx.outlineNavigationActive,true);
  assert.doesNotMatch(fn[0],/\.scrollIntoView\s*\(/);
  assert.match(fn[0],/preview\.scrollTo\(\{ top, behavior: 'smooth' \}\)/);
});


test('image export success/error notifications stay in front of the blurred overlay', () => {
  assert.match(html,/\.modal-overlay \{[\s\S]*?backdrop-filter: blur\(4px\);[\s\S]*?z-index: 200;/);
  const toast=html.match(/\.toast \{([\s\S]*?)\n    \}/);
  assert.ok(toast);
  assert.match(toast[1],/z-index: 400;/);
  assert.match(html,/function renderExportImagePreview\(\) \{/);
  assert.match(html,/showToast\(t\('toastPreviewGenerated'\)\)/);
  assert.match(html,/showToast\(t\('toastImageGenFailed', err\.message\)\)/);
  assert.match(html,/id="export-image-modal"/);
  assert.match(html,/id="export-image-preview"/);
});

test('heading caret positioning scrolls editor to top, even for last heading', () => {
  const match=html.match(/function scrollTextareaToCaret\(ta, alignToTop = false\) \{[\s\S]*?\n    \}/);
  assert.ok(match);
  const ta={
    value:'# First\ntext\n## Last',selectionStart:'# First\ntext\n'.length,
    clientHeight:280,scrollHeight:700,scrollTop:0,
    style:{paddingBottom:'',fontSize:'',width:''},
    scrollTo(options){this.scrolled=options;this.scrollTop=options.top;}
  };
  const mirror={style:{},appendChild(child){this.child=child;},textContent:''};
  const marker={offsetTop:660,textContent:''};
  const doc={
    createElement(tag){return tag==='span'?marker:mirror;},
    body:{appendChild(){},removeChild(){}}
  };
  const style={
    paddingTop:'28px',paddingBottom:'28px',fontSize:'16px',width:'460px'
  };
  const ctx={
    document:doc, getComputedStyle(){return style;}
  };
  vm.runInNewContext(match[0]+'\nthis.go=scrollTextareaToCaret;',ctx);
  const top=ctx.go(ta,true);
  assert.equal(top,632);
  assert.equal(ta.scrollTop,632);
  assert.equal(ta.scrolled.behavior,'smooth');
  assert.equal(ta.style.paddingBottom,'242px');
  // No expansion needed for an earlier heading.
  marker.offsetTop=75;
  ta.scrollHeight=700;
  ta.style.paddingBottom='242px';
  const earlier=ctx.go(ta,true);
  assert.equal(earlier,47);
  assert.equal(ta.style.paddingBottom,'');
  assert.equal(ta.scrolled.top,47);
  // Non-navigation behavior still places the cursor one third into the viewport.
  marker.offsetTop=330;
  ctx.go(ta);
  assert.equal(ta.scrollTop,Math.max(0,330-280/3));
});

test('scroll coupling stays paused during navigation and resumes when both panes settle', () => {
  const wait=html.match(/function waitForOutlineNavigation\(editorTop, previewTop\) \{[\s\S]*?\n    \}/);
  const sync=html.match(/function syncScroll\(source, target\) \{[\s\S]*?\n    \}/);
  assert.ok(wait&&sync);
  const frames=[];
  const editor={scrollTop:10,clientHeight:300,scrollHeight:1200};
  const preview={scrollTop:20,clientHeight:300,scrollHeight:1500};
  const ctx={
    outlineNavigationId:0,outlineNavigationActive:true,syncSuppressUntil:3000,
    readingMode:false,isSyncingScroll:false,now:100,
    editor,preview,
    Date:{now(){return ctx.now;}},
    requestAnimationFrame(fn){frames.push(fn);}
  };
  vm.runInNewContext(wait[0]+'\n'+sync[0]+'\nthis.wait=waitForOutlineNavigation;this.sync=syncScroll;',ctx);
  ctx.wait(400,620);
  assert.equal(ctx.outlineNavigationId,1);
  ctx.sync(editor,preview);
  assert.equal(preview.scrollTop,20);
  function frame(){ctx.now+=33;const fn=frames.shift();assert.ok(fn);fn();}
  editor.scrollTop=400;
  preview.scrollTop=500;
  frame();
  assert.equal(ctx.outlineNavigationActive,true);
  preview.scrollTop=620;
  frame();
  frame();
  frame();
  assert.equal(ctx.outlineNavigationActive,false);
  assert.equal(ctx.syncSuppressUntil,0);
  editor.scrollTop=0;
  ctx.sync(editor,preview);
  assert.equal(preview.scrollTop,0);
});

test('repeated outline jumps do not let a stale animation restore coupling', () => {
  const wait=html.match(/function waitForOutlineNavigation\(editorTop, previewTop\) \{[\s\S]*?\n    \}/);
  assert.ok(wait);
  const frames=[],editor={scrollTop:0},preview={scrollTop:0};
  const ctx={
    outlineNavigationId:0,outlineNavigationActive:true,syncSuppressUntil:1400,
    readingMode:false,editor,preview,now:0,
    Date:{now(){return ctx.now;}},
    requestAnimationFrame(fn){frames.push(fn);}
  };
  vm.runInNewContext(wait[0]+'\nthis.wait=waitForOutlineNavigation;',ctx);
  ctx.wait(100,100);
  ctx.wait(200,200);
  assert.equal(ctx.outlineNavigationId,2);
  ctx.now+=16;
  frames.shift()(); // stale navigation ID 1
  assert.equal(ctx.outlineNavigationActive,true);
  editor.scrollTop=200;
  preview.scrollTop=200;
  ctx.now+=16;
  frames.shift()();
  ctx.now+=16;
  frames.shift()();
  ctx.now+=16;
  frames.shift()();
  assert.equal(ctx.outlineNavigationActive,false);
});

test('outline navigation still targets the correct preview heading and now aligns editor', () => {
  const fn=html.match(/function jumpToHeading\(index\) \{[\s\S]*?\n    \}/);
  assert.ok(fn);
  const headings=[{level:1,line:0},{level:2,line:2},{level:2,line:4}];
  const body={style:{}};
  const preview={
    scrollTop:10,clientHeight:300,scrollHeight:900,clientTop:0,
    getBoundingClientRect(){return {top:100};},
    querySelectorAll(selector){assert.equal(selector,'.markdown-body h2');return [
      {getBoundingClientRect(){return {top:200};}},
      {getBoundingClientRect(){return {top:500};}}
    ];},
    querySelector(){return body;},
    scrollTo(args){this.scrolled=args;}
  };
  const raw='# Heading\np\n## Mid\np\n## Final';
  const editor={
    selectionStart:0,
    setSelectionRange(start){this.selectionStart=start;},
    focus(){}
  };
  const ctx={
    outlineHeadings:headings,readingMode:false,editor,preview,imageDataCollapsed:false,
    getMarkdown(){return raw;},
    document:{querySelectorAll(){return headings.map(()=>({classList:{toggle(){}}}));}},
    suppressScrollSync(){},scrollTextareaToCaret(ta,top){assert.equal(top,true);return 285;},
    waitForOutlineNavigation(editorTop,previewTop){ctx.waited=[editorTop,previewTop];},
    getComputedStyle(){return {paddingBottom:'24px'};}
  };
  vm.runInNewContext(fn[0]+'\njumpToHeading(2);',ctx);
  assert.equal(editor.selectionStart,raw.indexOf('## Final'));
  assert.equal(preview.scrolled.top,410);
  assert.equal(ctx.waited[0],285);
  assert.equal(ctx.waited[1],410);
  assert.equal(ctx.outlineNavigationActive,true);
  assert.doesNotMatch(fn[0],/\.scrollIntoView\s*\(/);
});
