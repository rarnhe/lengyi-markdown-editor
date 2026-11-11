// File System Access API: Ctrl+S overwrite and imported-file association tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync, existsSync} from 'node:fs';

const html=readFileSync('markdown-editor.html','utf8');
const extract=name=>{
  const f=html.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n    \\}'));
  assert.ok(f,'missing function: '+name);
  return f[0];
};
const saveFunctions=['normalizeMarkdownFilename','displayMarkdownFilename',
  'canSaveMarkdownToDisk','writeMarkdownFile','saveMarkdown'].map(extract).join('\n');

function writableHandle(name) {
  const state={name,writes:[],opens:0,closed:0,aborted:0,fail:false};
  state.createWritable=async()=>{
    state.opens++;
    return {write:async value=>{if(state.fail)throw Error('disk is full');state.writes.push(value);},
      close:async()=>{state.closed++;},abort:async()=>{state.aborted++;}};
  };
  return state;
}
function harness({supported=true,handle=writableHandle('paper.md')}={}) {
  const state={picks:0,downloads:0,browserSaves:0,toasts:[],suggestions:[]};
  const ctx={
    window:supported?{showSaveFilePicker:async options=>{
      state.picks++;state.suggestions.push(options.suggestedName);return handle;
    }}:{},
    currentMarkdownFileHandle:null,documentEditRevision:0,committedFilename:'paper.md',
    filenameInput:{value:'paper'},text:'# Original',
    getMarkdown(){return ctx.text;},persistBrowserBackup(){state.browserSaves++;return Promise.resolve(true);},
    exportFile(){state.downloads++;},showToast:value=>state.toasts.push(value),
    t:(key,message)=>key+':'+message
  };
  vm.runInNewContext(saveFunctions+'\nthis.api={saveMarkdown};',ctx);
  return {ctx,state,handle,api:ctx.api};
}

test('Ctrl+S selects a file once, then overwrites the same authorized file',async()=>{
  const {ctx,state,handle,api}=harness();
  await api.saveMarkdown();
  assert.equal(state.picks,1);
  assert.deepEqual(state.suggestions,['paper.md']);
  assert.deepEqual(handle.writes,['# Original']);
  ctx.text='# Updated';
  await api.saveMarkdown();
  assert.equal(state.picks,1);
  assert.deepEqual(handle.writes,['# Original','# Updated']);
  assert.equal(handle.closed,2);
  assert.equal(state.downloads,0);
  assert.equal(state.browserSaves,2);
});

test('renaming the displayed filename preserves the authorized handle and Ctrl+S never opens a picker',async()=>{
  const handle=writableHandle('original.md');
  const {ctx,state,api}=harness({handle});
  ctx.currentMarkdownFileHandle=handle;
  ctx.committedFilename='renamed.md';
  ctx.filenameInput.value='renamed';
  ctx.text='# Renamed content';
  await api.saveMarkdown();
  assert.equal(state.picks,0);
  assert.deepEqual(handle.writes,['# Renamed content']);
  assert.equal(ctx.currentMarkdownFileHandle,handle);
  assert.equal(ctx.committedFilename,'renamed.md');
});

test('imported Markdown handle is written directly without a save dialog',async()=>{
  const handle=writableHandle('imported.md');
  const {ctx,state,api}=harness();
  ctx.currentMarkdownFileHandle=handle;
  ctx.committedFilename='imported.md';
  ctx.text='# Imported and edited';
  await api.saveMarkdown();
  assert.equal(state.picks,0);
  assert.deepEqual(handle.writes,['# Imported and edited']);
});

test('first Ctrl+S cancellation is harmless',async()=>{
  const {ctx,state,api}=harness();
  ctx.window.showSaveFilePicker=async()=>{const e=new Error('cancelled');e.name='AbortError';throw e;};
  await api.saveMarkdown();
  assert.equal(ctx.currentMarkdownFileHandle,null);
  assert.equal(state.downloads,0);
});

test('unsupported File System Access API retains Ctrl+S download fallback',async()=>{
  const {api,state}=harness({supported:false});
  await api.saveMarkdown();
  assert.equal(state.downloads,1);
  assert.equal(state.picks,0);
});

test('failed write does not associate the selected handle or claim success',async()=>{
  const handle=writableHandle('broken.md');handle.fail=true;
  const {ctx,api,state}=harness({handle});
  await api.saveMarkdown();
  assert.equal(ctx.currentMarkdownFileHandle,null);
  assert.equal(handle.aborted,1);
  assert.equal(state.browserSaves,0);
  assert.equal(state.toasts.length,1);
  assert.match(state.toasts[0],/toastDiskSaveFailed/);
});

test('native import associates Markdown handle; legacy import has no write permission',()=>{
  const load=extract('loadFile');
  let updated='';
  const ctx={
    FileReader:class{readAsText(file){this.onload({target:{result:file.content}});}},
    setMarkdown:value=>{updated=value;},setDocumentImportTime:()=>{},
    filenameInput:{value:''},committedFilename:'old.md',currentMarkdownFileHandle:{name:'old.md'},
    displayMarkdownFilename:fname=>fname.replace(/\.(md|markdown)$/i,''),
    syncDocumentTitle:()=>{},updateFilenameWidth:()=>{},updatePreview:()=>{},
    updateCount:()=>{},saveToLocal:()=>{},showToast:()=>{},t:key=>key
  };
  vm.runInNewContext(load+'\nthis.load=loadFile;',ctx);
  ctx.load({name:'import.md',content:'# imported'});
  assert.equal(ctx.currentMarkdownFileHandle,null);
  assert.equal(updated,'# imported');
  const handle={name:'native.md'};
  ctx.load({name:'native.md',content:'# native'},handle);
  assert.equal(ctx.currentMarkdownFileHandle,handle);
});

test('toolbar has no Markdown save/export commands; Ctrl+S is the only Markdown save command',()=>{
  assert.doesNotMatch(html,/data-i18n="(?:saveMd|saveMdAs|exportMd)"/);
  assert.doesNotMatch(html,/saveMarkdownAs|markdownSaveStartHandle/);
  assert.match(html,/function saveMarkdown\(\)/);
  assert.match(html,/!e\.shiftKey[\s\S]*?void saveMarkdown\(\)/);
  assert.equal(existsSync('package.json'),false,'must not introduce npm');
});
