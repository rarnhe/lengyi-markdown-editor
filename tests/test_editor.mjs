import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync('markdown-editor.html', 'utf8');
const i18n = readFileSync('i18n.js', 'utf8');

test('standalone HTML editor and companion i18n.js exist', () => {
  assert.match(html, /<textarea id="editor"/);
  assert.match(html, /<textarea id="preview-source"/);
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
  const editor = makeTextarea(), previewSource = makeTextarea();
  const button = { textContent: '', title: '', setAttribute() {} };
  const context = vm.createContext({
    editor, previewSource, previewMode: 'preview',
    document: { getElementById() { return button; } },
    getActiveEditor() { return editor; },
    updatePreview() {}, updateCount() {}, showToast() {}, t: key => key
  });
  vm.runInContext(block[1] + '\nthis.api = {collapseImageData, expandImageData, getMarkdown, setMarkdown, toggleBase64, collapseTextareaData, copyExpandedBase64};', context);
  return { api: context.api, editor, previewSource };
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
  const {api, editor, previewSource} = foldingHarness();
  const raw = 'hello\n![photo](data:image/webp;base64,' + 'Z'.repeat(700) + ')\nworld';
  api.setMarkdown(raw);
  assert.equal(api.getMarkdown(), raw);
  assert.equal(editor.value, previewSource.value);
  assert.ok(editor.value.length < raw.length);
  editor.selectionStart = editor.selectionEnd = editor.value.length;
  api.toggleBase64();
  assert.equal(editor.value, raw);
  assert.equal(previewSource.value, raw);
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

test('switching preview tabs never overwrites initial content with empty source', () => {
  assert.match(html, /const wasSource = previewMode === 'source'/);
  assert.match(html, /if \(wasSource\) editor\.value = previewSource\.value;/);
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
