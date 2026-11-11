// File System Access API: overwrite imported Markdown and save renamed copies beside it.
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
const saveFunctions=['normalizeMarkdownFilename','canSaveMarkdownToDisk',
  'writeMarkdownFile','ensureMarkdownWritePermission','saveMarkdown'].map(extract).join('\n');
const locationFunctions=['writeLastMarkdownLocationHandle','readLastMarkdownLocationHandle',
  'rememberLastMarkdownLocation','restoreLastMarkdownLocation',
  'getLastMarkdownLocationStartIn','pickExportFileHandle',
  'writeBlobToFileHandle'].map(extract).join('\n');

function writableHandle(name,{permission='granted'}={}) {
  const state={name,writes:[],opens:0,closed:0,aborted:0,permissionRequests:[],permission};
  state.queryPermission=async options=>state.permission;
  state.requestPermission=async options=>{
    state.permissionRequests.push(options.mode);
    return state.permission;
  };
  state.createWritable=async()=>{
    state.opens++;
    return {write:async value=>state.writes.push(value),
      close:async()=>{state.closed++;},abort:async()=>{state.aborted++;}};
  };
  return state;
}
function harness({supported=true,initialHandle=null,saveHandles=[]}={}) {
  const state={picks:[],downloads:0,browserSaves:0,toasts:[],remembered:[]};
  const ctx={
    window:supported?{showSaveFilePicker:async options=>{
      state.picks.push(options);
      const next=saveHandles.shift();
      if(next instanceof Error)throw next;
      return next || null;
    }}:{},
    currentMarkdownFileHandle:initialHandle,
    currentMarkdownHandleFilename:initialHandle?.name || null,
    lastMarkdownLocationHandle:null,MARKDOWN_PICKER_ID:'lengyi-markdown-workspace',
    getLastMarkdownLocationStartIn(){return ctx.lastMarkdownLocationHandle || 'documents';},
    rememberLastMarkdownLocation(handle){ctx.lastMarkdownLocationHandle=handle;state.remembered.push(handle);return Promise.resolve(true);},
    documentEditRevision:0,committedFilename:initialHandle?.name || 'paper.md',
    filenameInput:{value:'paper'},text:'# Original',
    getMarkdown(){return ctx.text;},persistBrowserBackup(){state.browserSaves++;return Promise.resolve(true);},
    exportFile(){state.downloads++;},showToast:value=>state.toasts.push(value),
    t:(key,message)=>key+':'+message
  };
  vm.runInNewContext(saveFunctions+'\nthis.api={saveMarkdown};',ctx);
  return {ctx,state,api:ctx.api};
}

test('last location handle survives a fresh editor context through IndexedDB',async()=>{
  const records=new Map();
  const db={
    close(){},
    transaction(){
      const tx={};
      tx.objectStore=()=>({
        put(value,key){records.set(key,value);queueMicrotask(()=>tx.oncomplete());},
        get(key){const req={};queueMicrotask(()=>{req.result=records.get(key);req.onsuccess();});return req;}
      });
      return tx;
    }
  };
  const metadata=[];
  const handle={kind:'file',name:'source.md'};
  const first={
    lastMarkdownLocationHandle:null,
    LAST_LOCATION_KEY:'last-markdown-location',
    LAST_LOCATION_META_KEY:'md_editor_last_markdown_location',
    BACKUP_STORE:'documents',
    openMarkdownBackupDatabase:async()=>db,
    localStorage:{setItem:(key,value)=>metadata.push([key,JSON.parse(value)])}
  };
  vm.runInNewContext(locationFunctions+'\nthis.remember=rememberLastMarkdownLocation;',first);
  assert.equal(await first.remember(handle),true);
  assert.equal(records.get('last-markdown-location'),handle);
  assert.equal(metadata[0][0],'md_editor_last_markdown_location');
  assert.equal(metadata[0][1].name,'source.md');

  const second={lastMarkdownLocationHandle:null,LAST_LOCATION_KEY:'last-markdown-location',
    BACKUP_STORE:'documents',openMarkdownBackupDatabase:async()=>db};
  vm.runInNewContext(locationFunctions+'\nthis.restore=restoreLastMarkdownLocation;this.start=getLastMarkdownLocationStartIn;',second);
  assert.equal(await second.restore(),handle);
  assert.equal(second.start(),handle);
});

test('import and export pickers share the remembered directory and picker ID',async()=>{
  const remembered={kind:'file',name:'previous.md'};
  const options=[];
  const ctx={
    window:{showSaveFilePicker:async value=>{options.push(value);return {kind:'file',name:value.suggestedName};}},
    MARKDOWN_PICKER_ID:'lengyi-markdown-workspace',
    lastMarkdownLocationHandle:remembered,
    getLastMarkdownLocationStartIn:()=>ctx.lastMarkdownLocationHandle
  };
  vm.runInNewContext(extract('pickExportFileHandle')+'\nthis.pick=pickExportFileHandle;',ctx);
  await ctx.pick('draft.html','text/html',['.html']);
  assert.equal(options[0].id,'lengyi-markdown-workspace');
  assert.equal(options[0].startIn,remembered);
  assert.equal(options[0].suggestedName,'draft.html');
});

test('first Ctrl+S chooses a file once, then overwrites that selected file',async()=>{
  const handle=writableHandle('paper.md');
  const {ctx,state,api}=harness({saveHandles:[handle]});
  await api.saveMarkdown();
  assert.equal(state.picks.length,1);
  assert.equal(state.picks[0].suggestedName,'paper.md');
  assert.equal(state.picks[0].id,'lengyi-markdown-workspace');
  assert.equal(state.picks[0].startIn,'documents');
  assert.deepEqual(handle.writes,['# Original']);
  ctx.text='# Updated';
  await api.saveMarkdown();
  assert.equal(state.picks.length,1);
  assert.deepEqual(handle.writes,['# Original','# Updated']);
  assert.equal(state.browserSaves,2);
});

test('imported Markdown with unchanged title is overwritten directly without a save picker',async()=>{
  const original=writableHandle('original.md');
  const {ctx,state,api}=harness({initialHandle:original});
  ctx.committedFilename='original.md';
  ctx.text='# Imported and edited';
  await api.saveMarkdown();
  assert.equal(state.picks.length,0);
  assert.deepEqual(original.writes,['# Imported and edited']);
  assert.equal(ctx.currentMarkdownFileHandle,original);
  assert.equal(state.remembered.at(-1),original);
});

test('renaming imported Markdown creates a new file in the original directory',async()=>{
  const original=writableHandle('original.md');
  const renamed=writableHandle('renamed-title.md');
  const {ctx,state,api}=harness({initialHandle:original,saveHandles:[renamed]});
  ctx.committedFilename='renamed-title.md';
  ctx.text='# Updated content';
  await api.saveMarkdown();
  assert.equal(state.picks.length,1);
  assert.equal(state.picks[0].suggestedName,'renamed-title.md');
  assert.equal(state.picks[0].startIn,original,'new file picker must start in imported file directory');
  assert.deepEqual(original.writes,[],'renaming must not overwrite the imported original');
  assert.deepEqual(renamed.writes,['# Updated content']);
  assert.equal(ctx.currentMarkdownFileHandle,renamed);
  assert.equal(ctx.currentMarkdownHandleFilename,'renamed-title.md');

  ctx.text='# Second edit';
  await api.saveMarkdown();
  assert.equal(state.picks.length,1,'subsequent Ctrl+S overwrites the newly created file');
  assert.deepEqual(renamed.writes,['# Updated content','# Second edit']);
});

test('import-time permission is requested before getFile and original handle is passed to loader',async()=>{
  const events=[];
  const handle=writableHandle('source.md');
  handle.requestPermission=async options=>{events.push('permission:'+options.mode);return 'granted';};
  handle.getFile=async()=>{events.push('getFile');return {name:'source.md',content:'# source'};};
  const pickerOptions=[];
  const recentFolder={kind:'file',name:'previous.md'};
  const ctx={window:{showOpenFilePicker:async options=>{events.push('picker');pickerOptions.push(options);return [handle];}},
    loadFile:(file,received)=>{events.push('load:'+file.name);assert.equal(received,handle);},
    MARKDOWN_PICKER_ID:'lengyi-markdown-workspace',
    getLastMarkdownLocationStartIn:()=> recentFolder,
    rememberLastMarkdownLocation:async value=>{events.push('remember:'+value.name);},
    showToast:()=>{},t:key=>key};
  vm.runInNewContext(extract('openMarkdownFile')+'\nthis.open=openMarkdownFile;',ctx);
  await ctx.open();
  assert.deepEqual(events,['picker','permission:readwrite','getFile','load:source.md','remember:source.md']);
  assert.equal(pickerOptions[0].id,'lengyi-markdown-workspace');
  assert.equal(pickerOptions[0].startIn,recentFolder);
});

test('loadFile stores imported handle and its disk filename; handle-less imports clear association',()=>{
  const load=extract('loadFile');
  const editor={value:''};
  const ctx={
    FileReader:class{readAsText(file){this.onload({target:{result:file.content}});}},
    editor,clearTimeout:()=>{},historyTimer:null,historyStack:[],historyIndex:-1,lastHistoryText:null,
    createHistorySnapshot:()=>({type:'snapshot',text:editor.value,imageData:new Map()}),
    setMarkdown:value=>{editor.value=value;},setDocumentImportTime:()=>{},filenameInput:{value:''},
    committedFilename:'old.md',currentMarkdownFileHandle:{name:'old.md'},
    currentMarkdownHandleFilename:'old.md',normalizeMarkdownFilename:name=>/\.md$/i.test(name)?name:name+'.md',
    displayMarkdownFilename:name=>name.replace(/\.(md|markdown)$/i,''),
    syncDocumentTitle:()=>{},updateFilenameWidth:()=>{},updatePreview:()=>{},
    updateCount:()=>{},saveToLocal:()=>{},showToast:()=>{},t:key=>key
  };
  vm.runInNewContext(load+'\nthis.load=loadFile;',ctx);
  const handle={name:'source.md'};
  ctx.load({name:'source.md',content:'# source'},handle);
  assert.equal(ctx.currentMarkdownFileHandle,handle);
  assert.equal(ctx.currentMarkdownHandleFilename,'source.md');
  ctx.load({name:'legacy.md',content:'# legacy'});
  assert.equal(ctx.currentMarkdownFileHandle,null);
  assert.equal(ctx.currentMarkdownHandleFilename,null);
});

test('denied imported-file permission prevents writing instead of silently falling back to another file',async()=>{
  const original=writableHandle('original.md',{permission:'denied'});
  const {ctx,state,api}=harness({initialHandle:original});
  ctx.committedFilename='original.md';
  await api.saveMarkdown();
  assert.equal(original.permissionRequests.length,1);
  assert.equal(original.writes.length,0);
  assert.equal(state.picks.length,0);
  assert.equal(state.browserSaves,0);
});

test('renamed-file picker cancellation preserves original association and does not overwrite it',async()=>{
  const original=writableHandle('original.md');
  const cancel=new Error('cancelled');cancel.name='AbortError';
  const {ctx,state,api}=harness({initialHandle:original,saveHandles:[cancel]});
  ctx.committedFilename='renamed.md';
  await api.saveMarkdown();
  assert.equal(state.picks.length,1);
  assert.equal(ctx.currentMarkdownFileHandle,original);
  assert.deepEqual(original.writes,[]);
});

test('unsupported File System Access API retains Ctrl+S download fallback',async()=>{
  const {api,state}=harness({supported:false});
  await api.saveMarkdown();
  assert.equal(state.downloads,1);
  assert.equal(state.picks.length,0);
});

test('failed write does not claim success or persist a successful disk save',async()=>{
  const broken={name:'broken.md',createWritable:async()=>({
    write:async()=>{throw Error('disk full');},close:async()=>{},abort:async()=>{}
  })};
  const {ctx,state,api}=harness({initialHandle:broken});
  ctx.committedFilename='broken.md';
  await api.saveMarkdown();
  assert.equal(state.browserSaves,0);
  assert.equal(state.toasts.length,1);
  assert.match(state.toasts[0],/toastDiskSaveFailed/);
});

test('toolbar has no Markdown save/export commands; Ctrl+S is the only Markdown save command',()=>{
  assert.doesNotMatch(html,/data-i18n="(?:saveMd|saveMdAs|exportMd)"/);
  assert.doesNotMatch(html,/saveMarkdownAs|markdownSaveStartHandle/);
  assert.match(html,/function saveMarkdown\(\)/);
  assert.match(html,/!e\.shiftKey[\s\S]*?void saveMarkdown\(\)/);
  assert.match(html,/options\.startIn = handle/);
  assert.match(html,/id: MARKDOWN_PICKER_ID/);
  assert.match(html,/void restoreLastMarkdownLocation\(\)/);
  assert.match(html,/function exportWord\(\)[\s\S]*?pickExportFileHandle/);
  assert.match(html,/function exportHTML\(\)[\s\S]*?pickExportFileHandle/);
  assert.match(html,/async function downloadExportImage\(\)[\s\S]*?pickExportFileHandle/);
  assert.equal(existsSync('package.json'),false,'must not introduce npm');
});
