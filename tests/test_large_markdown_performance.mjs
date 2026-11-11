// Large Markdown performance regression tests. Node.js built-ins only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('markdown-editor.html', 'utf8');
const names = [
  'scheduleEditorPreview',
  'commitEditorChange',
  'handleEditorInput',
  'handleEditorCompositionStart',
  'handleEditorCompositionEnd'
];
const functions = names.map(name => {
  const match = html.match(new RegExp('    function ' + name + '\\([^]*?\\n    \\}'));
  assert.ok(match, name + ' must exist');
  return match[0];
}).join('\n');

function createHarness() {
  let now = 0, nextId = 1;
  const timers = new Map();
  const calls = { folded: 0, history: 0, preview: 0, count: 0, backup: 0 };
  const context = vm.createContext({
    editor: { value: 'initial', selectionStart: 0, selectionEnd: 0 },
    historyTimer: null,
    editorCompositionActive: false,
    editorPreviewTimer: null,
    clearTimeout(id) { timers.delete(id); },
    setTimeout(fn, delay) {
      const id = nextId++;
      timers.set(id, { fn, at: now + delay });
      return id;
    },
    collapseTextareaData() { calls.folded++; },
    recordHistory() { calls.history++; },
    updatePreview() { calls.preview++; },
    updateCount() { calls.count++; },
    autoSave() { calls.backup++; }
  });
  vm.runInContext(functions + '\nthis.api={' + names.join(',') + '};', context);
  function advance(ms) {
    now += ms;
    let ready;
    do {
      ready = [...timers.entries()]
        .filter(([, timer]) => timer.at <= now)
        .sort((a, b) => a[1].at - b[1].at);
      if (ready.length) {
        const [id, timer] = ready[0];
        timers.delete(id);
        timer.fn();
      }
    } while (ready.length);
  }
  return { api: context.api, calls, advance, timers };
}

test('IME composition does not mutate, render, count, record history, or autosave mid-composition', () => {
  const h = createHarness();
  h.api.handleEditorCompositionStart();
  h.api.handleEditorInput({ inputType: 'insertCompositionText', isComposing: true });
  // Some browsers emit a final-looking input before compositionend; the
  // composition state, not only InputEvent.isComposing, remains authoritative.
  h.api.handleEditorInput({ inputType: 'insertText', isComposing: false });
  h.advance(1000);
  assert.deepEqual(h.calls, {
    folded: 0, history: 0, preview: 0, count: 0, backup: 0
  });

  h.api.handleEditorCompositionEnd();
  assert.equal(h.calls.backup, 1);
  assert.equal(h.calls.preview, 0);
  assert.equal(h.calls.history, 0);
  h.advance(300);
  assert.equal(h.calls.preview, 1);
  assert.equal(h.calls.count, 1);
  h.advance(100);
  assert.equal(h.calls.history, 1);
});

test('ordinary keystrokes defer preview and never scan/fold the entire document', () => {
  const h = createHarness();
  h.api.handleEditorInput({ inputType: 'insertText', isComposing: false });
  h.api.handleEditorInput({ inputType: 'insertText', isComposing: false });
  assert.equal(h.calls.folded, 0);
  assert.equal(h.calls.preview, 0);
  assert.equal(h.calls.count, 0);
  assert.equal(h.calls.backup, 2);
  h.advance(299);
  assert.equal(h.calls.preview, 0);
  h.advance(1);
  assert.equal(h.calls.preview, 1);
  assert.equal(h.calls.count, 1);
  h.advance(100);
  assert.equal(h.calls.history, 1);
});

test('pasted or dropped Markdown still folds embedded Base64 data URLs', () => {
  const h = createHarness();
  h.api.handleEditorInput({ inputType: 'insertFromPaste', isComposing: false });
  h.api.handleEditorInput({ inputType: 'insertFromDrop', isComposing: false });
  assert.equal(h.calls.folded, 2);
  assert.equal(h.calls.preview, 0);
});

test('editor input event is composition-aware and preview work is not synchronous', () => {
  const input = html.match(/editor\.addEventListener\('input', handleEditorInput\)/);
  const start = html.match(/editor\.addEventListener\('compositionstart', handleEditorCompositionStart\)/);
  const end = html.match(/editor\.addEventListener\('compositionend', handleEditorCompositionEnd\)/);
  assert.ok(input && start && end);
  const handler = functions.match(/function handleEditorInput\(event\) \{[^]*?\n    \}/)[0];
  assert.doesNotMatch(handler, /updatePreview\(\)|updateCount\(\)/);
  assert.match(handler, /editorCompositionActive \|\| \(event && event\.isComposing\)/);
});
