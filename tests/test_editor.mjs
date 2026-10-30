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

test('import/export have no separate frame and share the utilities row', () => {
  const toolbar=html.match(/<div class="editor-toolbar" id="editor-toolbar">([\s\S]*?)<div class="main">/);
  assert.ok(toolbar);
  const src=toolbar[1];
  const keys=['data-i18n="mermaid"','id="toolbar-utilities"',
    'id="import-action"','id="export-dropdown"','id="view-dropdown"','id="theme-toggle"',
    'id="web-to-md-action"','id="lang-dropdown"','id="clear-action"','id="help-action"'];
  let previous=-1;
  for (const key of keys) {
    const next=src.indexOf(key,previous+1);
    assert.ok(next>previous,'Toolbar ordering: '+key);
    previous=next;
  }
  assert.equal((src.match(/class="toolbar-divider"/g)||[]).length,0);
  assert.doesNotMatch(src,/class="import-export-group"/);
  assert.match(src,/id="more-actions" hidden/);
  assert.match(src,/id="more-menu"><\/div>/);
  assert.match(src,/id="lang-menu"[\s\S]*?setLanguage\('pt'\)/);
  assert.doesNotMatch(html,/\.editor-toolbar \.import-export-group|width < 1260|width < 1720/);
  assert.match(html,/\.editor-toolbar \{[^}]*flex-wrap: nowrap;/);
  assert.doesNotMatch(html,/class="top-bar"/);
});

test('read-only filename preserves imported name, browser title and export behavior', () => {
  const fn=html.match(/function syncDocumentTitle\(\) \{[\s\S]*?\n    \}/);
  assert.ok(fn);
  const ctx={filenameInput:{value:'Report.md'},document:{title:'before'},t:()=> 'Untitled.md'};
  vm.runInNewContext(fn[0]+'\nthis.sync=syncDocumentTitle;',ctx);
  ctx.sync();assert.equal(ctx.document.title,'Report.md');
  ctx.filenameInput.value='Imported.md';ctx.sync();
  assert.equal(ctx.document.title,'Imported.md');
  const header=html.match(/<div class="preview-title-group">([\s\S]*?)<\/div>/);
  assert.ok(header);
  assert.match(header[1],/<input type="text" id="filename"[^>]*readonly aria-readonly="true"/);
  assert.match(header[1],/id="filename"[\s\S]*?id="document-time"/);
  assert.doesNotMatch(html,/filenameInput\.addEventListener\('input'|filenameInput\.addEventListener\('keydown'/);
  assert.match(html,/filenameInput\.value = name;\s*syncDocumentTitle\(\)/);
  assert.match(html,/localStorage\.setItem\(FILENAME_KEY, filenameInput\.value\)/);
  assert.match(html,/let name = filenameInput\.value\.trim\(\)/);
  assert.match(html,/function applyLanguage\(\) \{[\s\S]*?syncDocumentTitle\(\)/);
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
  for (const key of ['outlineTitle', 'outlineEmpty', 'collapseOutline', 'expandOutline']) {
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

test('Standard layout keeps independent editor and outline fold controls', () => {
  const menu=html.match(/<div class="dropdown-menu" id="view-menu">([\s\S]*?)<\/div>\s*<\/div>/);
  assert.ok(menu);
  assert.doesNotMatch(menu[1],/setLayoutMode\(|data-i18n="viewStandard"/);
  assert.match(menu[1],/setReadingMode\(true\)/);
  assert.match(menu[1],/toggleFullscreen\(\)/);
  assert.doesNotMatch(html,/function setLayoutMode\(|previewCollapsed|PREVIEW_COLLAPSED_KEY|LAYOUT_MODE_KEY/);
  assert.match(html,/editorCollapsed = localStorage\.getItem\(EDITOR_COLLAPSED_KEY\) === 'true'/);
  assert.match(html,/outlineVisible = localStorage\.getItem\(OUTLINE_VISIBLE_KEY\) !== 'false'/);
  assert.match(html,/function applyPaneStates\(\)/);
  assert.match(html,/function applyOutlineState\(\)/);
});

test('outline collapse arrow moves to the left, switches direction and preserves width', () => {
  const paneHeader=html.match(/<div class="pane outline-pane" id="outline-pane">([\s\S]*?)<div class="outline-list"/);
  assert.ok(paneHeader);
  assert.match(paneHeader[1],/id="outline-collapse-btn"[\s\S]*?icon-chevron-right/);
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
  assert.match(button.innerHTML,/icon-chevron-right/);
  assert.equal(button.attributes['aria-expanded'],'true');
  ctx.outlineVisible=false;
  ctx.syncOutline();
  assert.equal(pane.style.flex,'');
  assert.equal(pane.classList.states.collapsed,true);
  assert.equal(resizer.classList.states.hidden,true);
  assert.match(button.innerHTML,/icon-chevron-left/);
  assert.equal(button.attributes['aria-expanded'],'false');
  assert.match(html,/localStorage\.setItem\(OUTLINE_WIDTH_KEY, outlineWidth\)/);
});

test('ten languages use outline titles without obsolete view options', () => {
  for(const key of ['expandOutline','collapseOutline']) {
    assert.equal((i18n.match(new RegExp('^    '+key+':','gm'))||[]).length,10,key);
  }
  for(const old of ['viewBoth','viewEdit','viewPreview','viewOutline','viewStandard','collapsePreview','expandPreview']) {
    assert.doesNotMatch(i18n,new RegExp('^    '+old+':','m'),old);
  }
  assert.match(html,/\.editor-toolbar\.format-compact \.format-group > button span\[data-i18n="codeBlock"\] \{ display: inline; \}/);
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
  for(const hidden of ['.editor-toolbar','.statusbar','.editor-pane','#resizer','#outline-resizer','.preview-pane .pane-header']) {
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
  assert.match(html,/if \(!readingMode\) target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(html,/if \(!readingMode\) scrollTextareaToCaret\(target\)/);
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
  assert.match(html, /class="preview-title-group"[\s\S]*?<time id="document-time" aria-live="polite"><\/time>[\s\S]*?data-i18n="previewPaneTitle"/);
  assert.match(html, /#document-time \{[^}]*border: none; background: transparent; padding: 0;/);
  assert.match(html, /class="preview-title-group"[\s\S]*?class="filename-slot"[\s\S]*?id="filename"[\s\S]*?id="document-time"/);
  assert.doesNotMatch(html, /class="editor-heading"[\s\S]*?id="filename"[\s\S]*?data-i18n="editorPaneTitle"/);
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

test('responsive overflow moves one control at a time using actual available width', () => {
  const fn=html.match(/function applyToolbarOverflow\(\) \{[\s\S]*?\n    \}/);
  assert.ok(fn);
  const ids=['import-action','export-dropdown','view-dropdown','theme-toggle',
    'web-to-md-action','lang-dropdown','clear-action','help-action'];
  const widths=[68,80,76,68,110,75,67,67];
  const classSet=()=>({
    state:new Set(),
    add(...names){names.forEach(name=>this.state.add(name));},
    remove(...names){names.forEach(name=>this.state.delete(name));},
    contains(name){return this.state.has(name);}
  });
  const original=ids.map((id,i)=>({id,tagName:id==='import-action'?'LABEL':
      ['export-dropdown','view-dropdown','lang-dropdown'].includes(id)?'DIV':'BUTTON',
    width:widths[i],classList:classSet(),parent:null}));
  const nodes=Object.fromEntries(original.map(x=>[x.id,x]));
  const detach=x=>{
    if(x.parent)x.parent.items.splice(x.parent.items.indexOf(x),1);
  };
  const inline={items:[],appendChild(x){detach(x);this.items.push(x);x.parent=this;}};
  const menu={items:[],prepend(x){detach(x);this.items.unshift(x);x.parent=this;}};
  const more={hidden:true};
  const toolbar={clientWidth:1500,classList:classSet(),
    get scrollWidth(){
      if (this.classList.contains('format-scroll')) return this.clientWidth;
      const base=this.classList.contains('format-compact')?290:400;
      return base + inline.items.reduce((sum,x)=>sum+x.width,0)+(more.hidden?0:58);
    }
  };
  const ctx={
    toolbarActionIds:ids,
    toolbarLayoutBusy:false,
    document:{getElementById(id){return {
      'editor-toolbar':toolbar,'toolbar-utilities':inline,'more-menu':menu,
      'more-actions':more,...nodes}[id];}},
    closeMoreMenu(){ctx.closed++;},closed:0
  };
  vm.runInNewContext(fn[0]+'\nthis.layout=applyToolbarOverflow;',ctx);
  const fit=width=>{toolbar.clientWidth=width;ctx.layout();return menu.items.map(x=>x.id);};
  assert.deepEqual(fit(1500),[]);
  assert.equal(more.hidden,true);
  assert.deepEqual(inline.items.map(x=>x.id),ids);
  assert.deepEqual(fit(1050),[]);
  assert.deepEqual(fit(980),['clear-action','help-action']);
  assert.deepEqual(fit(920),['lang-dropdown','clear-action','help-action']);
  assert.deepEqual(fit(810),['web-to-md-action','lang-dropdown','clear-action','help-action']);
  assert.deepEqual(fit(560),['export-dropdown','view-dropdown','theme-toggle',
    'web-to-md-action','lang-dropdown','clear-action','help-action']);
  assert.deepEqual(fit(210),ids);
  assert.equal(toolbar.classList.contains('format-compact'),true);
  assert.equal(toolbar.classList.contains('format-scroll'),true);
  assert.equal(more.hidden,false);
  assert.deepEqual(fit(1500),[]);
  assert.deepEqual(inline.items.map(x=>x.id),ids);
  assert.equal(more.hidden,true);
  assert.equal(toolbar.classList.contains('format-scroll'),false);
  // Hidden toolbar in Reading Mode should not relocate controls.
  toolbar.clientWidth=0;ctx.layout();
  assert.equal(more.hidden,true);
  assert.match(html,/window\.addEventListener\('resize', applyToolbarOverflow\)/);
  assert.match(html,/new ResizeObserver\(applyToolbarOverflow\)\.observe/);
  assert.match(html,/toolbar\.scrollWidth > toolbar\.clientWidth \+ 1/);
  assert.doesNotMatch(html,/width < 1260|width < 1720/);
  assert.match(html,/applyLanguage\(\);\s*applyToolbarOverflow\(\);/);
  assert.match(html,/function saveToLocal\(\)/);
  assert.match(html,/function openFindModal\(/);
  assert.match(html,/e\.key === 's'[\s\S]*?saveToLocal\(\)/);
  assert.match(html,/e\.key === 'f'[\s\S]*?openFindModal\(\)/);
});

test('directional movement converges at both edges without forcing intermediate positions', () => {
  const fn=html.match(/function directionalScrollMovement\(delta, sourceBefore, sourceMax, otherBefore, otherMax\) \{[\s\S]*?\n    \}/);
  assert.ok(fn);
  const ctx={};
  vm.runInNewContext(fn[0]+'\nthis.move=directionalScrollMovement;',ctx);
  assert.equal(ctx.move(20,80,100,40,200),160);
  assert.equal(ctx.move(-20,80,100,40,200),-10);
  assert.equal(ctx.move(20,80,100,199,200),1);
  assert.equal(ctx.move(-80,80,100,20,200),-20);
  assert.equal(ctx.move(30,100,100,50,200),0);
  assert.equal(ctx.move(-20,0,100,50,200),0);
  assert.equal(ctx.move(0,80,100,40,200),0);
  // Approaching an edge from different starting positions uses the remaining distance.
  for (const [direction,src,srcMax,other,otherMax] of [
    [1,120,500,60,300],[1,290,300,90,100],[1,0,800,700,1200],
    [-1,400,500,900,1500],[-1,10,100,400,800],[-1,700,800,1,250]
  ]) {
    const delta=direction>0?srcMax-src:-src;
    const next=other+ctx.move(delta,src,srcMax,other,otherMax);
    assert.ok(Math.abs(next-(direction>0?otherMax:0))<1e-8);
  }
});

test('native scroll events mirror wheel and scrollbar dragging, without a feedback loop', () => {
  const max=html.match(/function maxPaneScroll\(pane\) \{[\s\S]*?\n    \}/);
  const directional=html.match(/function directionalScrollMovement\(delta, sourceBefore, sourceMax, otherBefore, otherMax\) \{[\s\S]*?\n    \}/);
  const track=html.match(/function trackPaneScroll\(source, counterpart\) \{[\s\S]*?\n    \}/);
  assert.ok(max&&directional&&track);
  const left={scrollTop:80,scrollHeight:500,clientHeight:100};
  const right={scrollTop:40,scrollHeight:900,clientHeight:100};
  const ctx={observedScrollTop:new WeakMap(),readingMode:false,
    editorCollapsed:false,outlineJumpActive:false};
  vm.runInNewContext(max[0]+'\n'+directional[0]+'\n'+track[0]+'\nthis.track=trackPaneScroll;',ctx);
  ctx.observedScrollTop.set(left,80);
  ctx.observedScrollTop.set(right,40);
  left.scrollTop=100; // scrollbar drag or wheel, observed via same native scroll event
  ctx.track(left,right);
  assert.equal(right.scrollTop,87.5); // 20 * (800-40)/(400-80)
  ctx.track(right,left); // resulting programmatic scroll event must not bounce
  assert.equal(left.scrollTop,100);
  left.scrollTop=400;
  ctx.track(left,right);
  assert.equal(right.scrollTop,800);
  right.scrollTop=400;
  ctx.track(right,left);
  assert.equal(left.scrollTop,200);
  right.scrollTop=0;
  ctx.track(right,left);
  assert.equal(left.scrollTop,0);
  ctx.readingMode=true;
  left.scrollTop=50;ctx.track(left,right);
  assert.equal(right.scrollTop,0);
  ctx.readingMode=false;
  ctx.editorCollapsed=true;
  left.scrollTop=60;ctx.track(left,right);
  assert.equal(right.scrollTop,0);
  ctx.editorCollapsed=false;
  ctx.outlineJumpActive=true;
  left.scrollTop=70;ctx.track(left,right);
  assert.equal(right.scrollTop,0);
  assert.match(html,/editor\.addEventListener\('scroll', \(\) => trackPaneScroll\(editor, preview\), \{ passive: true \}\)/);
  assert.match(html,/preview\.addEventListener\('scroll', \(\) => trackPaneScroll\(preview, editor\), \{ passive: true \}\)/);
  assert.doesNotMatch(html,/addEventListener\('wheel'/);
});

test('reading-mode outline jumps to preview without focusing or scrolling the hidden editor', () => {
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
    querySelectorAll(selector){assert.equal(selector,'.markdown-body h2');return [first,second];},
    querySelector(){return body;},
    scrollTo(options){this.scrolled=options;}
  };
  const editor={
    selectionStart:0,
    setSelectionRange(a){this.selectionStart=a;},
    focus(){throw Error('reading mode must not focus the hidden editor');}
  };
  const ctx={
    outlineHeadings,readingMode:true,editor,preview,imageDataCollapsed:false,
    getMarkdown(){return '# Top\n## First\n### Nested\n## Second';},
    scrollTextareaToCaret(){throw Error('reading mode must not scroll hidden editor');},
    document:{querySelectorAll(){return Array.from({length:4},()=>({classList:{toggle(){}}}));}},
    getComputedStyle(){return {paddingBottom:'32px'};},
    outlineJumpToken:0,finishOutlineJump(token){ctx.completed=token;}
  };
  vm.runInNewContext(fn[0]+'\njumpToHeading(3);',ctx);
  assert.equal(preview.scrolled.top,700);
  assert.equal(preview.scrolled.behavior,'instant');
  assert.equal(body.style.paddingBottom,'234px');
  assert.equal(editor.selectionStart,'# Top\n## First\n### Nested\n'.length);
  assert.match(fn[0],/if \(!readingMode\) scrollTextareaToCaret\(target\)/);
  assert.equal(ctx.completed,1);
  assert.doesNotMatch(fn[0],/\.scrollIntoView\s*\(/);
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

test('textarea measurement uses its actual client width, accounting for scrollbar wrapping', () => {
  const fn=html.match(/function measureTextareaHeadingTop\(ta\) \{[\s\S]*?\n    \}/);
  assert.ok(fn);
  const marker={offsetTop:660,textContent:''};
  const mirror={style:{},appendChild(child){this.marker=child;},textContent:''};
  const doc={
    createElement(type){return type==='span'?marker:mirror;},
    body:{appendChild(){},removeChild(){}}
  };
  const ta={value:'a\n'.repeat(1000),selectionStart:100,clientWidth:441};
  const ctx={document:doc,getComputedStyle(){return {
    paddingTop:'28px',paddingBottom:'28px',fontSize:'16px',
    lineHeight:'28.8px',fontFamily:'monospace'
  };}};
  vm.runInNewContext(fn[0]+'\nthis.measure=measureTextareaHeadingTop;',ctx);
  assert.equal(ctx.measure(ta),632);
  assert.equal(mirror.style.width,'441px');
  assert.equal(mirror.style.whiteSpace,'pre-wrap');
  assert.equal(mirror.style.wordBreak,'break-all');
  assert.equal(mirror.style.overflowWrap,'break-word');
  assert.equal(mirror.textContent,ta.value.substring(0,100));
  assert.match(fn[0],/mirror\.style\.width = ta\.clientWidth/);
  assert.doesNotMatch(fn[0],/mirror\.style\.width = style\.width/);
});

test('deep and last editor headings can always be brought to top with verified scroll room', () => {
  const fn=html.match(/function scrollTextareaToCaret\(ta\) \{[\s\S]*?\n    \}/);
  assert.ok(fn);
  let currentTarget=632;
  const ta={style:{paddingBottom:''},clientHeight:280,
    get scrollHeight() {
      const padding=parseFloat(this.style.paddingBottom)||28;
      return 700+(padding-28);
    },
    scrollTop:0,
    scrollTo(opts) {
      this.scrolled=opts;
      this.scrollTop=Math.min(opts.top,Math.max(0,this.scrollHeight-this.clientHeight));
    }
  };
  const ctx={
    measureTextareaHeadingTop(){return currentTarget;},
    getComputedStyle(){return {paddingBottom:ta.style.paddingBottom||'28px'};}
  };
  const max=html.match(/function maxPaneScroll\(pane\) \{[\s\S]*?\n    \}/);
  vm.runInNewContext(max[0]+'\n'+fn[0]+'\nthis.align=scrollTextareaToCaret;',ctx);
  ctx.align(ta);
  assert.equal(ta.scrollTop,632);
  assert.equal(ta.scrolled.behavior,'instant');
  assert.equal(ta.style.paddingBottom,'244px');
  currentTarget=4400;
  ctx.align(ta);
  assert.equal(ta.scrollTop,4400);
  assert.ok(ta.scrollHeight-ta.clientHeight>=4400);
  currentTarget=47;
  ctx.align(ta);
  assert.equal(ta.scrollTop,47);
  assert.equal(ta.style.paddingBottom,'');
});

test('dead proportional sync and orphan Standard/fullscreen handlers have been removed', () => {
  for(const obsolete of ['function syncScroll(', 'function suppressScrollSync(',
    'function waitForOutlineNavigation(', 'outlineNavigationActive',
    'outlineNavigationId', 'syncSuppressUntil', 'isSyncingScroll',
    'setLayoutMode(', 'onFullscreenChange']) {
    assert.equal(html.includes(obsolete),false,obsolete);
  }
  for(const required of ['function maxPaneScroll(', 'function directionalScrollMovement(',
    'function trackPaneScroll(', 'function measureTextareaHeadingTop(',
    "editor.addEventListener('scroll'", "preview.addEventListener('scroll'"]) {
    assert.equal(html.includes(required),true,required);
  }
  assert.doesNotMatch(i18n,/^    viewStandard:/m);
});

test('standard-mode outline aligns both headings without cross-pane correction', () => {
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
  const editor={selectionStart:0,setSelectionRange(start){this.selectionStart=start;},focus(opts){this.focusOptions=opts;}};
  const ctx={
    outlineHeadings:headings,readingMode:false,editor,preview,imageDataCollapsed:false,
    getMarkdown(){return raw;},
    document:{querySelectorAll(){return headings.map(()=>({classList:{toggle(){}}}));}},
    scrollTextareaToCaret(ta){assert.equal(ta,editor);ctx.editorAlignmentCalls++;},
    editorAlignmentCalls:0,
    outlineJumpToken:0,finishOutlineJump(token){ctx.completed=token;},
    getComputedStyle(){return {paddingBottom:'24px'};}
  };
  vm.runInNewContext(fn[0]+'\njumpToHeading(2);',ctx);
  assert.equal(editor.selectionStart,raw.indexOf('## Final'));
  assert.equal(preview.scrolled.top,410);
  assert.equal(preview.scrolled.behavior,'instant');
  assert.equal(ctx.editorAlignmentCalls,1);
  assert.equal(editor.focusOptions.preventScroll,true);
  assert.equal(ctx.completed,1);
  assert.doesNotMatch(fn[0],/\.scrollIntoView\s*\(/);
  assert.doesNotMatch(fn[0],/suppressScrollSync|waitForOutlineNavigation|outlineNavigationActive/);
});

test('cleaned help content and documentation reflect the current menu and wheel navigation', () => {
  const zh=readFileSync('README.zh.md','utf8');
  const en=readFileSync('README.md','utf8');
  assert.doesNotMatch(zh,/视图 → 标准/);
  assert.match(zh,/独立滚动位置|独立滚动/);
  assert.match(en,/independent scrolling/);
  assert.doesNotMatch(html,/--radius-xl:/);
  for (const old of ['仅编辑 / 仅预览','Edit only / Preview only','Nur bearbeiten / Nur Vorschau']) {
    assert.equal(i18n.includes(old),false,old);
  }
  assert.match(i18n,/点击大纲标题可分别将两栏的标题置顶/);
});


test('More menu toggles, closes on outside click, and cleans up language submenu', () => {
  const start=html.match(/function toggleMoreMenu\(\) \{[\s\S]*?\n    \}/);
  const end=html.match(/function closeMoreMenu\(\) \{[\s\S]*?\n    \}/);
  assert.ok(start && end);
  const open={state:false,classList:{
    toggle(key){open.state=!open.state;return open.state;},
    remove(){open.state=false;}
  }};
  const attrs={};
  const toggle={setAttribute(k,v){attrs[k]=v;}};
  const dom={getElementById(id){return id==='more-menu'?open:toggle;}};
  const ctx={document:dom,closeLangMenu(){ctx.closedLanguages++;},closedLanguages:0};
  vm.runInNewContext(start[0]+'\n'+end[0]+'\nthis.toggle=toggleMoreMenu;this.close=closeMoreMenu;',ctx);
  ctx.toggle();assert.equal(open.state,true);assert.equal(attrs['aria-expanded'],'true');
  ctx.toggle();assert.equal(open.state,false);assert.equal(attrs['aria-expanded'],'false');
  assert.equal(ctx.closedLanguages,1);
  ctx.toggle();ctx.close();
  assert.equal(open.state,false);assert.equal(attrs['aria-expanded'],'false');
  assert.equal(ctx.closedLanguages,2);
});

test('theme action swaps 夜间 and 日间 on click, language change and stored dark theme', () => {
  const update=html.match(/function updateThemeButton\(\) \{[\s\S]*?\n    \}/);
  assert.ok(update);
  const themeSpan={textContent:''};
  const icon={href:'',setAttribute(k,v){this[k]=v;}};
  const attrs={};
  const button={
    title:'',querySelector(q){return q==='#theme-label'?themeSpan:icon;},
    setAttribute(k,v){attrs[k]=v;}
  };
  const body={theme:'light',getAttribute(){return this.theme;},setAttribute(k,v){this.theme=v;}};
  const ctx={
    document:{body,getElementById(){return button;}},
    t(key){return key==='themeDark'?'夜间':'日间';}
  };
  vm.runInNewContext(update[0]+'\nthis.update=updateThemeButton;',ctx);
  ctx.update();
  assert.equal(themeSpan.textContent,'夜间');
  assert.equal(icon.href,'#icon-moon');
  assert.equal(button.title,'夜间');
  body.theme='dark';ctx.update();
  assert.equal(themeSpan.textContent,'日间');
  assert.equal(icon.href,'#icon-sun');
  assert.equal(attrs['aria-label'],'日间');
  assert.match(html,/function toggleTheme\(\) \{[\s\S]*?updateThemeButton\(\);/);
  assert.match(html,/function applyLanguage\(\) \{[\s\S]*?updateThemeButton\(\);/);
  assert.match(html,/id="theme-toggle" onclick="toggleTheme\(\)"/);
  for (const key of ['themeDark','themeLight','moreMenu']) {
    assert.equal((i18n.match(new RegExp('^    '+key+':','gm'))||[]).length,10,key);
  }
  assert.match(i18n,/themeDark: '夜间'/);
  assert.match(i18n,/themeLight: '日间'/);
});


test('filename is displayed before preview time but cannot be edited or confirmed by Enter', () => {
  const heading=html.match(/<div class="preview-title-group">([\s\S]*?)<\/div>/);
  assert.ok(heading);
  assert.match(heading[1],/id="filename"[^>]*readonly aria-readonly="true"[\s\S]*?id="document-time"/);
  assert.doesNotMatch(html,/filenameInput\.addEventListener\('keydown'/);
  assert.doesNotMatch(html,/filenameInput\.addEventListener\('input'/);
  assert.match(html,/filenameInput\.value = localStorage\.getItem\(FILENAME_KEY\)/);
  assert.match(html,/function loadFile\(file\)[\s\S]*?filenameInput\.value = name;/);
});

test('link editing uses a standard modal and captures the selected text before focusing URL', () => {
  const modal=html.match(/<div class="modal-overlay" id="link-modal">([\s\S]*?)<!-- 插入图片模态框 -->/);
  assert.ok(modal);
  assert.match(modal[1],/class="modal-header"[\s\S]*?class="modal-body"[\s\S]*?class="modal-footer"/);
  assert.match(modal[1],/id="link-text-input"[\s\S]*?id="link-url-input"/);
  assert.match(modal[1],/confirmLinkInsert\(\)/);
  assert.doesNotMatch(html,/prompt\(t\('promptLinkUrl'\)/);
  const open=html.match(/function openLinkModal\(\) \{[\s\S]*?\n    \}/);
  const confirm=html.match(/function confirmLinkInsert\(\) \{[\s\S]*?\n    \}/);
  assert.ok(open&&confirm);
  const form={display:'none',classList:{add(){}},offsetWidth:50,style:{}};
  const label={value:''},url={value:'',focused:false,focus(){this.focused=true;}};
  const editor={value:'Hello world',selectionStart:6,selectionEnd:11,
    setRangeText(text,start,end){this.value=this.value.slice(0,start)+text+this.value.slice(end);this.inserted=[text,start,end];},
    focus(){this.focused=true;}};
  const dom={getElementById(id){return {'link-text-input':label,'link-url-input':url,'link-modal':form}[id];}};
  const ctx={editor,document:dom,linkSelection:null,t:k=>k==='link'?'链接':k,
    pushHistory(){ctx.history++;},updatePreview(){},updateCount(){},autoSave(){},
    closeLinkModal(){ctx.closed++;ctx.linkSelection=null;},
    showToast(msg){ctx.warning=msg;},history:0,closed:0};
  vm.runInNewContext(open[0]+'\n'+confirm[0]+'\nthis.open=openLinkModal;this.commit=confirmLinkInsert;',ctx);
  ctx.open();
  assert.equal(label.value,'world');
  assert.equal(url.focused,true);
  assert.equal(ctx.linkSelection.start,6);
  ctx.commit();
  assert.equal(ctx.history,0);
  assert.equal(ctx.warning,'promptLinkUrl');
  url.value='https://example.com/a';
  ctx.commit();
  assert.equal(editor.value,'Hello [world](https://example.com/a)');
  assert.equal(ctx.history,1);assert.equal(ctx.closed,1);
  editor.value='';editor.selectionStart=0;editor.selectionEnd=0;
  ctx.open();assert.equal(label.value,'链接');
  url.value='https://example.com';
  ctx.commit();assert.equal(editor.value,'[链接](https://example.com)');
  assert.match(html,/function insertLink\(\) \{\s*openLinkModal\(\);/);
  assert.match(html,/onclick="openLinkModal\(\)" data-i18n-title="link"/);
  assert.match(html,/e\.key === 'k'[\s\S]*?insertLink\(\)/);
  for(const key of ['linkModalTitle','linkTextLabel','linkUrlLabel','linkTextPlaceholder','linkUrlPlaceholder']) {
    assert.equal((i18n.match(new RegExp('^    '+key+':','gm'))||[]).length,10,key);
  }
});


test('main inline JavaScript and translations parse without new runtime dependencies', () => {
  const first=html.indexOf('  <script>');
  const last=html.lastIndexOf('  </script>');
  assert.ok(first>0 && last>first);
  const source=html.slice(first+'  <script>'.length,last);
  assert.doesNotThrow(()=>new vm.Script(source,{filename:'markdown-editor.html'}));
  assert.doesNotThrow(()=>new vm.Script(i18n,{filename:'i18n.js'}));
});

test('format tools and More remain on one row even at very narrow widths', () => {
  assert.match(html,/\.editor-toolbar \{[^}]*flex-wrap: nowrap;/);
  assert.match(html,/\.editor-toolbar\.format-scroll \.format-group \{[^}]*flex: 1 1 auto; min-width: 0; overflow-x: auto;/);
  assert.match(html,/\.editor-toolbar \.more-actions \{ flex: 0 0 auto; \}/);
  assert.match(html,/\.editor-toolbar \.more-actions\[hidden\] \{ display: none; \}/);
  assert.match(html,/@media \(max-width: 768px\) \{[\s\S]*?\.editor-toolbar \{ padding: 6px; gap: 4px; flex-wrap: nowrap; \}/);
  assert.match(html,/\.app\.reading-mode \.editor-toolbar[, ]/);
  assert.match(html,/id="more-actions" hidden/);
});

test('Language button uses the correct chevron in inline and overflow layouts', () => {
  const button=html.match(/id="lang-dropdown"[^]*?<button type="button"[^]*?<\/button>/);
  assert.ok(button);
  assert.match(button[0],/language-inline-chevron"[^]*?icon-chevron-down/);
  assert.match(button[0],/language-overflow-chevron"[^]*?icon-chevron-left/);
  assert.match(html,/#toolbar-utilities \.language-overflow-chevron,\s*#toolbar-utilities \.view-overflow-chevron \{ display: none; \}/);
  assert.match(html,/#more-menu \.language-inline-chevron,\s*#more-menu \.view-inline-chevron \{ display: none; \}/);
});


test('full readonly filename retains its suffix in preview with time-sized bold typography', () => {
  assert.match(html,/\.preview-title-group \{[^}]*gap: 10px/);
  assert.match(html,/#document-time, \.preview-title-group #filename \{[^}]*font-family: inherit; font-size: 11px;/);
  assert.match(html,/\.preview-title-group \.filename-slot \{[^}]*flex: 0 0 auto; min-width: 0;/);
  assert.match(html,/\.preview-title-group #filename \{ font-weight: 700; text-align: left; \}/);
  assert.match(html,/\.preview-title-group #document-time \{ font-weight: 400; \}/);
  assert.match(html,/\.filename-slot input\[type="text"\] \{[^}]*padding: 0;[^}]*border: none;/);
  const fn=html.match(/function updateFilenameWidth\(\) \{[\s\S]*?\n    \}/);
  assert.ok(fn);
  const slot={style:{}};
  const input={value:'A.md',parentElement:slot};
  const ctx={
    filenameInput:input,
    document:{createElement(type){
      assert.equal(type,'canvas');
      return {getContext(){return {font:'',measureText(value){
        return {width:value.length*7.5};
      }}}};
    }},
    getComputedStyle(){return {font:'600 12px sans-serif'};}
  };
  vm.runInNewContext(fn[0]+'\nthis.measureFilename=updateFilenameWidth;',ctx);
  ctx.measureFilename();
  assert.equal(slot.style.width,'31px');
  input.value='LongerName.md';
  ctx.measureFilename();
  assert.equal(slot.style.width,'99px');
  assert.match(html,/function applyLanguage\(\) \{[\s\S]*?updateFilenameWidth\(\);/);
  assert.match(html,/filenameInput\.value = name;\s*syncDocumentTitle\(\);\s*updateFilenameWidth\(\)/);
});

test('Base64 toggle is hidden and disabled except for Markdown with embedded image data', () => {
  assert.match(html,/id="base64-toggle"[^>]*hidden disabled/);
  const detector=html.match(/function hasEmbeddedBase64Image\(\) \{[\s\S]*?\n    \}/);
  const updater=html.match(/function updateBase64Button\(\) \{[\s\S]*?\n    \}/);
  assert.ok(detector&&updater);
  const button={hidden:false,disabled:false,textContent:'',title:'',attributes:{},
    setAttribute(k,v){this.attributes[k]=v;}};
  const ctx={
    content:'',
    getMarkdown(){return ctx.content;},
    imageDataCollapsed:true,
    document:{getElementById(){return button;}},
    t(x){return x;}
  };
  vm.runInNewContext(detector[0]+'\n'+updater[0]+'\nthis.update=updateBase64Button;',ctx);
  ctx.update();assert.equal(button.hidden,true);assert.equal(button.disabled,true);
  ctx.content='![ordinary](https://example.com/photo.jpg)';
  ctx.update();assert.equal(button.hidden,true);
  ctx.content='![embedded](data:image/png;base64,'+'Q'.repeat(220)+')';
  ctx.update();assert.equal(button.hidden,false);assert.equal(button.disabled,false);
  assert.equal(button.attributes['aria-pressed'],'false');
  ctx.imageDataCollapsed=false;ctx.update();
  assert.equal(button.textContent,'hideBase64');
  ctx.content='plain Markdown again';ctx.update();
  assert.equal(button.hidden,true);assert.equal(button.disabled,true);
  const toggle=html.match(/function toggleBase64\(\) \{[\s\S]*?\n    \}/);
  assert.match(toggle[0],/if \(!hasEmbeddedBase64Image\(\)\) return;/);
  assert.match(html,/function updatePreview\(\) \{\s*let text = getMarkdown\(\);\s*updateBase64Button\(\);/);
});

test('View menu chevron points left in overflow while remaining down inline', () => {
  const view=html.match(/id="view-dropdown"[\s\S]*?<button[^>]*onclick="toggleViewMenu\(\)"[\s\S]*?<\/button>/);
  assert.ok(view);
  assert.match(view[0],/view-inline-chevron"[^]*?icon-chevron-down/);
  assert.match(view[0],/view-overflow-chevron"[^]*?icon-chevron-left/);
  assert.match(html,/#more-menu \.view-overflow-chevron \{ display: inline; \}/);
});

test('Export View and Language overflow triggers are left-aligned and keep menus', () => {
  const css=[...html.matchAll(/#more-menu > \.dropdown > button \{([\s\S]*?)\}/g)];
  assert.ok(css.length);
  assert.match(css[css.length-1][1],/justify-content: flex-start; text-align: left;/);
  assert.doesNotMatch(css[css.length-1][1],/justify-content: space-between/);
  assert.match(html,/#more-menu > #view-dropdown > \.dropdown-menu/);
  assert.match(html,/#more-menu > #export-dropdown > \.dropdown-menu/);
  assert.match(html,/#more-menu #lang-menu \{ left: auto; top: 0; right: calc\(100% \+ 6px\);/);
  assert.match(html,/id="export-dropdown"[\s\S]*?id="export-menu"/);
});

test('inline Chinese Language menu opens inward at right edge without being clipped', () => {
  assert.match(html,/#toolbar-utilities #lang-menu \{ left: auto; right: 0; top: 100%; margin-top: 8px; \}/);
  assert.match(html,/#more-menu #lang-menu \{ left: auto; top: 0; right: calc\(100% \+ 6px\); margin-top: 0; \}/);
  const toggler=html.match(/function toggleLangMenu\(\) \{[\s\S]*?\n    \}/);
  const state={show:false, classList:{toggle(key){state.show=!state.show;return state.show;}}};
  const ctx={document:{getElementById(){return state;}}};
  vm.runInNewContext(toggler[0]+'\nthis.toggle=toggleLangMenu;',ctx);
  ctx.toggle();assert.equal(state.show,true);
  ctx.toggle();assert.equal(state.show,false);
  assert.match(html,/if \(langDropdown && !langDropdown\.contains\(e\.target\)\) \{\s*closeLangMenu\(\)/);
});


test('clicking inline Language must not be closed by the inactive More menu', () => {
  const click=html.match(/\/\/ 点击外部关闭下拉菜单\s*\n\s*document\.addEventListener\('click', \(e\) => \{[\s\S]*?\n    \}\);/);
  assert.ok(click);
  const handlers={};
  const state={moreOpen:false,langOpen:true,moreCloses:0,langCloses:0};
  const elements={
    'lang-dropdown':{contains(target){return target==='inline-language';}},
    'more-dropdown':{contains(target){return target==='more-button';}},
    'more-menu':{classList:{contains(c){return c==='show'&&state.moreOpen;}}}
  };
  const ctx={
    document:{
      addEventListener(name,fn){handlers[name]=fn;},
      getElementById(id){return elements[id]||null;}
    },
    closeLangMenu(){state.langOpen=false;state.langCloses++;},
    closeMoreMenu(){state.moreOpen=false;state.langOpen=false;state.moreCloses++;}
  };
  vm.runInNewContext(click[0],ctx);
  assert.equal(typeof handlers.click,'function');
  handlers.click({target:'inline-language'});
  assert.equal(state.langOpen,true,'Inline Language should remain open');
  assert.equal(state.moreCloses,0,'Closed More menu must not be closed again');
  state.moreOpen=true;state.langOpen=true;
  handlers.click({target:'outside'});
  assert.equal(state.moreCloses,1,'Open More menu closes on outside click');
  assert.equal(state.langOpen,false);
});


test('editor collapse hides scrollable textarea exactly as outline collapse hides its list', () => {
  assert.match(html,/\.outline-pane\.collapsed \.outline-list \{ display: none; \}/);
  assert.match(html,/\.editor-pane\.collapsed #editor \{ display: none; \}/);
  const editorPane=html.match(/<div class="pane editor-pane">([\s\S]*?)<div class="resizer"/);
  const outlinePane=html.match(/<div class="pane outline-pane" id="outline-pane">([\s\S]*?)<\/div>\s*<\/div>/);
  assert.ok(editorPane && outlinePane);
  assert.match(editorPane[1],/<textarea id="editor"[\s\S]*?<\/textarea>/);
  assert.match(outlinePane[1],/class="outline-list" id="outline-list"/);
  const state=html.match(/function applyPaneStates\(\) \{[\s\S]*?\n    \}/);
  assert.ok(state);
  assert.match(state[0],/editorPane\.classList\.toggle\('collapsed', editorCollapsed\)/);
  assert.match(state[0],/resizer\.classList\.toggle\('hidden', editorCollapsed\)/);
  // No JavaScript display toggling: the class alone controls CSS and reverses on expand.
  assert.doesNotMatch(state[0],/editor\.style\.display|textarea\.style\.display/);
  const mobile=html.match(/@media \(max-width: 768px\) \{[\s\S]*?\.pane\.collapsed/);
  assert.ok(mobile);
  assert.doesNotMatch(html,/\.editor-pane #editor \{ display: none; \}/);
});

test('preview title order preserves full filename, timestamp, preview label and word count', () => {
  const header=html.match(/<div class="preview-title-group">([\s\S]*?)<\/div>/);
  assert.ok(header);
  const indices=['id="filename"','id="document-time"','data-i18n="previewPaneTitle"','id="word-count"']
    .map(needle=>header[1].indexOf(needle));
  assert.ok(indices.every(index=>index>=0));
  assert.deepEqual(indices,[...indices].sort((a,b)=>a-b));
  const editorHeader=html.match(/<div class="editor-heading">([\s\S]*?)<\/div>/);
  assert.ok(editorHeader);
  assert.doesNotMatch(editorHeader[1],/id="filename"/);
  assert.equal((html.match(/id="filename"/g)||[]).length,1);
  assert.equal((html.match(/id="document-time"/g)||[]).length,1);
  assert.match(html,/filenameInput\.value = name;\s*syncDocumentTitle\(\);\s*updateFilenameWidth\(\);/);
  assert.match(html,/localStorage\.setItem\(FILENAME_KEY, filenameInput\.value\)/);
});
