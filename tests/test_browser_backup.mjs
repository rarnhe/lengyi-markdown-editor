// Native browser backup tests: localStorage quota -> IndexedDB fallback.
// Uses only Node.js built-ins, with a minimal asynchronous IndexedDB mock.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync('markdown-editor.html','utf8');
const fn=name=>{
  const r=html.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n    \\}'));
  assert.ok(r,name+' is present');
  return r[0];
};
const all=['openMarkdownBackupDatabase','writeMarkdownBackupToIndexedDB',
  'readMarkdownBackupFromIndexedDB','browserBackupFailed','persistBrowserBackup',
  'restoreLargeBrowserBackupIfNeeded'].map(fn).join('\n');

function database({failOpen=false,failWrite=false}={}){
  const records=new Map();
  const state={openCount:0,closeCount:0,records,failOpen,failWrite};
  const db={
    objectStoreNames:{contains:()=>true},
    createObjectStore(){},
    close(){state.closeCount++;},
    transaction(name,mode){
      assert.equal(name,'documents');
      const tx={error:null,oncomplete:null,onerror:null,onabort:null};
      tx.objectStore=()=>({
        put(data,key){
          queueMicrotask(()=>{
            if(state.failWrite){
              tx.error=new Error('IndexedDB quota');tx.onerror?.();
            }else{
              records.set(key,data);tx.oncomplete?.();
            }
          });
        },
        get(key){
          const request={result:null,onsuccess:null,onerror:null};
          queueMicrotask(()=>{request.result=records.get(key);request.onsuccess?.();});
          return request;
        }
      });
      return tx;
    }
  };
  const api={
    open(){
      state.openCount++;
      if(state.failOpen)throw Error('IndexedDB blocked');
      const request={result:db,onupgradeneeded:null,onerror:null,onsuccess:null};
      queueMicrotask(()=>request.onsuccess?.());
      return request;
    }
  };
  return {api,state};
}

function localCache({quota=250}={}){
  const data=new Map(),state={data,quota};
  const api={
    setItem(k,v){
      if(k==='md_editor_content' && String(v).length>state.quota){
        const error=new Error('exceeded quota');
        error.name='QuotaExceededError';
        throw error;
      }
      data.set(k,String(v));
    },
    getItem:k=>data.has(k)?data.get(k):null,
    removeItem:k=>data.delete(k)
  };
  return {api,state};
}
function fixture({db=database(),local=localCache(),limit=180,markdown='# A'}={}){
  const state={hints:0,toasts:[],markdown,filename:'test.md',loaded:null,
    historyChanged:0,rendered:0,counted:0,updatedTitle:0,updatedWidth:0};
  const ctx={
    indexedDB:db.api,localStorage:local.api,Promise,
    BACKUP_DB_NAME:'lengyi-markdown-backup',
    BACKUP_STORE:'documents',BACKUP_KEY:'current',
    MAX_LOCAL_BACKUP_CHARS:limit,STORAGE_KEY:'md_editor_content',
    FILENAME_KEY:'md_editor_filename',browserBackupQueue:Promise.resolve(),
    browserBackupRevision:0,documentEditRevision:0,
    browserBackupWarningShown:false,
    committedFilename:state.filename,currentMarkdownFileHandle:null,
    filenameInput:{value:'test'},
    getMarkdown(){return state.markdown;},
    setMarkdown(value){state.markdown=value;state.loaded=value;},
    normalizeMarkdownFilename:name=>/\.(md|markdown)$/i.test(name)?name:name+'.md',
    displayMarkdownFilename:name=>name.replace(/\.(md|markdown)$/i,''),
    updateFilenameWidth(){state.updatedWidth++;},
    syncDocumentTitle(){state.updatedTitle++;},
    updatePreview(){state.rendered++;},
    updateCount(){state.counted++;},
    historyStack:[],historyIndex:3,lastHistoryText:'prior',
    showSaveHint(){state.hints++;},
    showToast:value=>state.toasts.push(value),
    t:key=>key
  };
  const vmctx=vm.createContext(ctx);
  vm.runInContext(all+'\nthis.api={persistBrowserBackup,'+
    'readMarkdownBackupFromIndexedDB,restoreLargeBrowserBackupIfNeeded};',vmctx);
  return {ctx:vmctx,state,db,local,api:vmctx.api};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('small Markdown remains in localStorage with original filename and no IndexedDB',async()=>{
  const f=fixture({markdown:'# tiny'});
  assert.equal(await f.api.persistBrowserBackup(),true);
  assert.equal(f.local.state.data.get('md_editor_content'),'# tiny');
  assert.equal(f.local.state.data.get('md_editor_filename'),'test.md');
  assert.equal(f.db.state.openCount,0);
  assert.equal(f.state.hints,1);
});

test('large Markdown bypasses limited localStorage and is recoverable from IndexedDB',async()=>{
  const doc='# Big\n\n![image](data:image/png;base64,'+'A'.repeat(1000)+')';
  const f=fixture({markdown:doc,limit:180});
  f.local.api.setItem('md_editor_content','# outdated snapshot');
  assert.equal(await f.api.persistBrowserBackup(),true);
  assert.equal(f.local.api.getItem('md_editor_content'),null,'old draft must not mask IndexedDB restore');
  assert.equal(f.local.api.getItem('md_editor_filename'),'test.md');
  assert.equal(f.db.state.records.get('current').markdown,doc);
  assert.equal((await f.api.readMarkdownBackupFromIndexedDB()).markdown,doc);
  assert.equal(f.state.hints,1);
  assert.deepEqual(f.state.toasts,[]);
});

test('smaller Markdown that hits an unexpectedly full localStorage also falls back',async()=>{
  const f=fixture({markdown:'x'.repeat(120),limit:500,
    local:localCache({quota:40})});
  assert.equal(await f.api.persistBrowserBackup(),true);
  assert.equal(f.db.state.records.get('current').markdown,'x'.repeat(120));
  assert.equal(f.local.api.getItem('md_editor_content'),null);
});

test('when both browser stores fail, only a browser-cache warning is shown once',async()=>{
  const f=fixture({markdown:'Q'.repeat(500),
    db:database({failOpen:true}),limit:30});
  assert.equal(await f.api.persistBrowserBackup(),false);
  assert.equal(await f.api.persistBrowserBackup(),false);
  assert.equal(f.state.toasts.length,1);
  assert.equal(f.state.toasts[0],'toastBrowserBackupFailed');
  assert.equal(f.state.hints,0);
});

test('large backups restore full Markdown, filename and undo history',async()=>{
  const db=database(),local=localCache();
  const data='# Recovered\n'+'A'.repeat(300);
  const original=fixture({db,local,markdown:data,limit:100});
  original.ctx.committedFilename='report.markdown';
  assert.equal(await original.api.persistBrowserBackup(),true);
  const page=fixture({db,local,markdown:'# Welcome',limit:100});
  page.api.restoreLargeBrowserBackupIfNeeded();
  await tick();
  assert.equal(page.state.loaded,data);
  assert.equal(page.ctx.committedFilename,'report.markdown');
  assert.equal(page.ctx.filenameInput.value,'report');
  assert.equal(page.ctx.historyStack.length,1);
  assert.equal(page.ctx.historyIndex,0);
  assert.equal(page.ctx.lastHistoryText,data);
  assert.equal(page.state.rendered,1);
  assert.equal(page.state.counted,1);
});

test('asynchronous recovery cannot overwrite an edit made while database is opening',async()=>{
  let complete;
  const ctx={
    documentEditRevision:0,currentMarkdownFileHandle:null,
    readMarkdownBackupFromIndexedDB:()=>new Promise(resolve=>{complete=resolve;}),
    setMarkdown(){throw Error('Must not overwrite user typing');}
  };
  const callback=vm.runInNewContext(fn('restoreLargeBrowserBackupIfNeeded')+
    '\nthis.restore=restoreLargeBrowserBackupIfNeeded;',ctx);
  callback();
  ctx.documentEditRevision++;
  complete({markdown:'# Old document',filename:'old.md'});
  await tick();
});

test('an earlier queued IndexedDB write cannot delete a newer localStorage backup',async()=>{
  const db=database(),local=localCache({quota:9999});
  const f=fixture({db,local,limit:120,markdown:'A'.repeat(300)});
  const first=f.api.persistBrowserBackup();
  f.state.markdown='# new small edit';
  const second=f.api.persistBrowserBackup();
  assert.equal(await second,true);
  assert.equal(await first,true);
  assert.equal(local.api.getItem('md_editor_content'),'# new small edit');
});

test('an already-successful disk write is never misreported as a disk failure if browser backup fails',async()=>{
  const fragment=['normalizeMarkdownFilename','displayMarkdownFilename',
    'canSaveMarkdownToDisk','writeMarkdownFile','saveMarkdown']
    .map(fn).join('\n');
  let closed=0;
  const handle={name:'large.md',createWritable:async()=>({
    write:async()=>{},close:async()=>{closed++;}})};
  const toasts=[];
  const ctx={
    window:{showSaveFilePicker:async()=>handle},
    currentMarkdownFileHandle:handle,
    committedFilename:'large.md',filenameInput:{value:'large'},
    documentEditRevision:0,
    getMarkdown:()=> 'A'.repeat(5000000),
    persistBrowserBackup:async()=>false,
    showToast:value=>toasts.push(value),t:key=>key
  };
  const save=vm.runInNewContext(fragment+'\nthis.save=saveMarkdown;',ctx);
  await save();
  assert.equal(closed,1);
  assert.deepEqual(toasts,['toastDiskSaved']);
  assert.equal(ctx.documentEditRevision,1);
});

test('startup only consults large IndexedDB backup when localStorage has no Markdown',()=>{
  assert.match(html,/if \(saved === null\) restoreLargeBrowserBackupIfNeeded\(\)/);
  assert.match(html,/function autoSave\(\) \{[^]*?persistBrowserBackup\(\)/);
  assert.match(html,/function saveToLocal\(\) \{[^]*?persistBrowserBackup\(\)/);
  assert.doesNotMatch(fn('saveMarkdown'),/saveToLocal\(\)/);
});
