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
