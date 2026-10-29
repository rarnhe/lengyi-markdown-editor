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
