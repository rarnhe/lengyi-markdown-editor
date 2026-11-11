// File System Access API: save/overwrite/save-as/import tests using Node built-ins.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync, existsSync} from 'node:fs';

const html=readFileSync('markdown-editor.html','utf8');
const i18n=readFileSync('i18n.js','utf8');
const extract=name=>{
  const f=html.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n    \\}'));
  assert.ok(f,'missing function: '+name);
  return f[0];
};
const saveFunctions=['normalizeMarkdownFilename','displayMarkdownFilename',
  'canSaveMarkdownToDisk','writeMarkdownFile','saveMarkdownAs','saveMarkdown']
  .map(extract).join('\n');

function writableHandle(name) {
  const state={name,writes:[],opens:0,closed:0,aborted:0,fail:false};
  state.createWritable=async()=>{
    state.opens++;
    return {
      write:async value=>{
        if(state.fail)throw Error('disk is full');
        state.writes.push(value);
      },
      close:async()=>{state.closed++;},
      abort:async()=>{state.aborted++;}
    };
  };
  return state;
}
function harness({supported=true,handle=writableHandle('paper.md')}={}) {
  const state={picks:0,downloads:0,localSaves:0,toasts:[],suggestions:[],
    titleUpdates:0,widthUpdates:0};
  const ctx={
    window:supported?{showSaveFilePicker:async options=>{
      state.picks++;state.suggestions.push(options.suggestedName);return handle;
    }}:{},
    currentMarkdownFileHandle:null,committedFilename:'paper.md',
    filenameInput:{value:'paper'},
    text:'# Original',getMarkdown(){return ctx.text;},
    updateFilenameWidth(){state.widthUpdates++;},
    syncDocumentTitle(){state.titleUpdates++;},
    saveToLocal(){state.localSaves++;},
    exportFile(){state.downloads++;},
    showToast:value=>state.toasts.push(value),
    t:(key,message)=>key+':'+message
  };
  vm.runInNewContext(saveFunctions+
    '\nthis.api={saveMarkdown,saveMarkdownAs,canSaveMarkdownToDisk,writeMarkdownFile};',ctx);
  return {ctx,state,handle,api:ctx.api};
}

test('Ctrl+S first chooses file then writes; second save overwrites SAME file',async()=>{
  const {ctx,state,handle,api}=harness();
  assert.equal(api.canSaveMarkdownToDisk(),true);
  await api.saveMarkdown();
  assert.equal(state.picks,1);
  assert.deepEqual(state.suggestions,['paper.md']);
  assert.equal(handle.opens,1);
  assert.deepEqual(handle.writes,['# Original']);
  assert.equal(ctx.currentMarkdownFileHandle,handle);
  ctx.text='# Edited after first save';
  await api.saveMarkdown();
  assert.equal(state.picks,1,'no second file picker');
  assert.deepEqual(handle.writes,['# Original','# Edited after first save']);
  assert.equal(handle.closed,2);
  assert.equal(state.downloads,0,'no numbered browser downloads');
  assert.equal(state.localSaves,2);
  assert.deepEqual(state.toasts,['toastDiskSaved:undefined','toastDiskSaved:undefined']);
});

test('Save As chooses a new file and later Ctrl+S overwrites that new file',async()=>{
  const first=writableHandle('first.md'), second=writableHandle('second.markdown');
  const {ctx,state,api}=harness({handle:first});
  await api.saveMarkdown();
  ctx.window.showSaveFilePicker=async options=>{
    state.picks++;state.suggestions.push(options.suggestedName);return second;
  };
  ctx.text='After Save As';
  await api.saveMarkdownAs();
  assert.equal(ctx.committedFilename,'second.markdown');
  assert.equal(ctx.filenameInput.value,'second');
  assert.equal(ctx.currentMarkdownFileHandle,second);
  assert.deepEqual(first.writes,['# Original']);
  assert.deepEqual(second.writes,['After Save As']);
  ctx.text='After Ctrl+S';
  await api.saveMarkdown();
  assert.deepEqual(second.writes,['After Save As','After Ctrl+S']);
  assert.equal(state.picks,2);
  assert.equal(state.titleUpdates,2);
});

test('cancelled Save As keeps the previously authorized file and does not download',async()=>{
  const {ctx,api,state,handle}=harness();
  await api.saveMarkdown();
  const previousToasts=state.toasts.slice();
  ctx.window.showSaveFilePicker=async()=>{
    const err=new Error('User cancelled');err.name='AbortError';throw err;
  };
  await api.saveMarkdownAs();
  assert.equal(ctx.currentMarkdownFileHandle,handle);
  assert.equal(ctx.committedFilename,'paper.md');
  assert.equal(state.downloads,0);
  assert.deepEqual(state.toasts,previousToasts);
});

test('unsupported File System Access API falls back to explicit download',async()=>{
  const {api,state}=harness({supported:false});
  assert.equal(api.canSaveMarkdownToDisk(),false);
  await api.saveMarkdown();
  await api.saveMarkdownAs();
  assert.equal(state.downloads,2);
  assert.equal(state.picks,0);
});

test('failed file write never claims success or commits newly selected handle',async()=>{
  const handle=writableHandle('broken.md');handle.fail=true;
  const {ctx,api,state}=harness({handle});
  await api.saveMarkdown();
  assert.equal(ctx.currentMarkdownFileHandle,null);
  assert.equal(state.localSaves,0);
  assert.equal(handle.closed,0);
  assert.equal(handle.aborted,1);
  assert.equal(state.toasts.length,1);
  assert.match(state.toasts[0],/toastDiskSaveFailed/);
});

test('native Open picker carries a handle into importing and fallback input remains available',async()=>{
  const opened=writableHandle('research.md');
  opened.getFile=async()=>({name:'research.md',content:'# Research'});
  const seen=[];
  const ctx={
    window:{showOpenFilePicker:async()=>[opened]},
    loadFile:(file,handle)=>seen.push({file,handle}),
    showToast:()=>{},t:key=>key
  };
  const source=[extract('openMarkdownFile'),extract('handleImportClick')].join('\n');
  vm.runInNewContext(source+
    '\nthis.api={openMarkdownFile,handleImportClick};',ctx);
  await ctx.api.openMarkdownFile();
  assert.equal(seen.length,1);
  assert.equal(seen[0].handle,opened);
  let prevented=false;
  ctx.api.handleImportClick({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.match(html,/for="importFile" onclick="handleImportClick\(event\)"/);
  assert.match(html,/function importFile\(input\) \{[^]*?loadFile\(file\)/);
});

test('legacy file import or drag does not authorize writes to an unrelated file',()=>{
  const load=extract('loadFile');
  let updated='',associated='uninitialized';
  const ctx={
    FileReader:class{
      readAsText(file){this.onload({target:{result:file.content}});}
    },
    setMarkdown:value=>{updated=value;},
    setDocumentImportTime:()=>{},
    filenameInput:{value:''},committedFilename:'old.md',
    currentMarkdownFileHandle:{name:'old.md'},
    displayMarkdownFilename:fname=>fname.replace(/\.(md|markdown)$/i,''),
    syncDocumentTitle:()=>{},updateFilenameWidth:()=>{},
    updatePreview:()=>{},updateCount:()=>{},saveToLocal:()=>{},
    showToast:()=>{},t:key=>key
  };
  vm.runInNewContext(load+'\nthis.load=loadFile;',ctx);
  ctx.load({name:'import.md',content:'# hello'});
  assert.equal(ctx.currentMarkdownFileHandle,null);
  assert.equal(ctx.filenameInput.value,'import');
  assert.equal(ctx.committedFilename,'import.md');
  assert.equal(updated,'# hello');
  const handle={name:'chosen.md'};
  ctx.load({name:'chosen.md',content:'# direct'},handle);
  assert.equal(ctx.currentMarkdownFileHandle,handle);
  ctx.load({name:'notes.txt',content:'plain'},handle);
  assert.equal(ctx.currentMarkdownFileHandle,null,'txt files must not be overwritten as md');
  assert.equal(ctx.committedFilename,'notes.txt.md');
});

test('metadata and UI wiring keep full filename in storage but remove extension from displayed title',()=>{
  assert.match(html,/id="filename" value="未命名文档"/);
  assert.match(html,/committedFilename = normalizeMarkdownFilename\(localStorage\.getItem\(FILENAME_KEY\)/);
  assert.match(html,/filenameInput\.value = displayMarkdownFilename\(committedFilename\)/);
  assert.match(html,/document\.title = \(committedFilename \|\| t\('filenameDefault'\)\)/);
  assert.match(html,/localStorage\.setItem\(FILENAME_KEY, committedFilename\)/);
  assert.match(html,/currentMarkdownFileHandle = null;/);
  assert.match(html,/onclick="saveMarkdown\(\); closeExportMenu\(\);"/);
  assert.match(html,/onclick="saveMarkdownAs\(\); closeExportMenu\(\);"/);
  assert.match(html,/onclick="exportFile\(\); closeExportMenu\(\);"/);
  for(const key of ['saveMd','saveMdAs','toastDiskSaved','toastDiskSaveFailed','toastDiskOpenFailed'])
    assert.equal((i18n.match(new RegExp('^    '+key+':','gm'))||[]).length,10);
  assert.equal(existsSync('package.json'),false,'must not introduce npm');
});
