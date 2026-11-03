// Native ClipboardEvent / FileReader tests for copied images from PowerPoint,
// screenshots and web pages. Built-in Node.js vm only; no npm, frameworks or libs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('markdown-editor.html','utf8');
const i18n=readFileSync('i18n.js','utf8');
const folding=html.match(/\/\/ Base64 folding BEGIN([\s\S]*?)\/\/ Base64 folding END/);
const paste=html.match(/\/\/ Clipboard image paste BEGIN([\s\S]*?)\/\/ Clipboard image paste END/);

function harness({defer=false,confirmResult=true}={}) {
  assert.ok(folding,'existing Base64 folding helpers must be present');
  assert.ok(paste,'paste handler must be in standalone editor HTML');
  const track={ prevented:0,read:0,history:0,record:0,saved:0,
    preview:0,count:0,toasts:[],confirm:0,finishRead:null };
  const editor={
    value:'',selectionStart:0,selectionEnd:0,
    setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;},
    setRangeText(value,a,b,selectionMode){
      assert.equal(selectionMode,'end');
      this.value=this.value.slice(0,a)+value+this.value.slice(b);
      this.selectionStart=this.selectionEnd=a+value.length;
    },
    focus(){}
  };
  class FileReader {
    readAsDataURL(file){
      track.read++;
      const finish=()=>{
        if(file.fail){this.onerror?.({target:this});return;}
        this.result=file.dataUrl;
        this.onload?.({target:this});
      };
      if(defer)track.finishRead=finish;
      else finish();
    }
  }
  const button={hidden:false,disabled:false,setAttribute(){},textContent:'',title:''};
  const ctx=vm.createContext({
    editor,FileReader,
    document:{getElementById:()=>button},
    showToast:value=>track.toasts.push(value),
    t:key=>key,
    confirm:()=>{track.confirm++;return confirmResult;},
    pushHistory:()=>{track.history++;},
    recordHistory:()=>{track.record++;},
    autoSave:()=>{track.saved++;},
    updatePreview:()=>{track.preview++;},
    updateCount:()=>{track.count++}
  });
  vm.runInContext(folding[1]+"\n"+paste[1]+
    "\nthis.api={handleEditorImagePaste,getClipboardRasterImage,getMarkdown,setMarkdown,collapseImageData};",ctx);
  return {api:ctx.api,editor,track};
}

function makeImage(mime='image/png',data='A'.repeat(400),size=1024){
  return {type:mime,size,dataUrl:'data:'+mime+';base64,'+data};
}
function pasteEvent(items,types=['text/html']){
  let prevented=0;
  const event={
    clipboardData:{items,types,files:[]},
    preventDefault(){prevented++;}
  };
  return {event,prevented:()=>prevented};
}
function raster(file){
  return {kind:'file',type:file.type,getAsFile:()=>file};
}

test('PPT PNG clipboard image is pasted as Markdown Base64 and folded in editor',()=>{
  const {api,editor,track}=harness();
  api.setMarkdown('text before  and after');
  editor.setSelectionRange(12,12);
  const file=makeImage('image/png','A'.repeat(1024));
  const p=pasteEvent([raster(file),{kind:'string',type:'text/html'}],['text/html']);
  api.handleEditorImagePaste(p.event);
  assert.equal(p.prevented(),1);
  assert.equal(track.read,1);
  assert.match(api.getMarkdown(),/text before !\[image\]\(data:image\/png;base64,A{1024}\) and after/);
  assert.match(editor.value,/⟦Base64图片#\d+已折叠⟧/);
  assert.equal(track.history,1);
  assert.equal(track.record,1);
  assert.equal(track.preview,1);
  assert.equal(track.count,1);
  assert.equal(track.saved,1);
  assert.deepEqual(track.toasts,['toastImageInserted']);
  assert.equal(editor.selectionStart,editor.selectionEnd);
});

test('Among multiple clipboard variants prefer PNG over GIF or JPEG',()=>{
  const {api}=harness();
  const gif=makeImage('image/gif','B'.repeat(400));
  const jpeg=makeImage('image/jpeg','C'.repeat(400));
  const png=makeImage('image/png','D'.repeat(400));
  const selected=api.getClipboardRasterImage({items:[raster(gif),raster(jpeg),raster(png)]});
  assert.equal(selected.mime,'image/png');
  assert.equal(selected.file,png);
});

test('ClipboardData.files fallback handles image without items',()=>{
  const {api,track}=harness();
  const file=makeImage('image/jpeg','E'.repeat(300));
  const p=pasteEvent([],[]);
  p.event.clipboardData.files=[file];
  api.handleEditorImagePaste(p.event);
  assert.equal(p.prevented(),1);
  assert.match(api.getMarkdown(),/!\[image\]\(data:image\/jpeg;base64,E{300}\)/);
  assert.equal(track.read,1);
});

test('Ordinary text paste remains native and does not modify the editor',()=>{
  const {api,editor,track}=harness();
  editor.value='already here';
  const p=pasteEvent([{kind:'string',type:'text/plain'}],['text/plain']);
  api.handleEditorImagePaste(p.event);
  assert.equal(p.prevented(),0);
  assert.equal(editor.value,'already here');
  assert.equal(track.read,0);
  assert.equal(track.history,0);
});

test('Unsupported PPT EMF-only clipboard receives a warning without injecting fake Base64',()=>{
  const {api,editor,track}=harness();
  const emf={kind:'file',type:'image/x-emf',getAsFile:()=>makeImage('image/x-emf')};
  const p=pasteEvent([emf],[]);
  api.handleEditorImagePaste(p.event);
  assert.equal(p.prevented(),1);
  assert.equal(editor.value,'');
  assert.deepEqual(track.toasts,['toastPasteImageUnsupported']);
  assert.equal(track.read,0);
});

test('Unsupported image with text/plain leaves native text paste untouched',()=>{
  const {api,track}=harness();
  const emf={kind:'file',type:'image/x-emf',getAsFile:()=>makeImage('image/x-emf')};
  const p=pasteEvent([emf,{kind:'string',type:'text/plain'}],['text/plain','text/html']);
  api.handleEditorImagePaste(p.event);
  assert.equal(p.prevented(),0);
  assert.deepEqual(track.toasts,[]);
});

test('Images larger than 5 MiB are rejected before FileReader',()=>{
  const {api,track,editor}=harness();
  const p=pasteEvent([raster(makeImage('image/png','F'.repeat(300),5*1024*1024+1))]);
  api.handleEditorImagePaste(p.event);
  assert.equal(p.prevented(),1);
  assert.equal(track.read,0);
  assert.deepEqual(track.toasts,['toastImageTooLarge']);
  assert.equal(editor.value,'');
});

test('2-5 MiB clipboard images require confirmation; cancellation does not mutate content',()=>{
  const {api,track,editor}=harness({confirmResult:false});
  editor.value='draft';
  const p=pasteEvent([raster(makeImage('image/png','A'.repeat(300),3*1024*1024))]);
  api.handleEditorImagePaste(p.event);
  assert.equal(track.confirm,1);
  assert.equal(track.read,0);
  assert.equal(editor.value,'draft');
  assert.equal(p.prevented(),1);
});

test('FileReader failure leaves editor content and undo history unchanged',()=>{
  const {api,editor,track}=harness();
  editor.value='safe';
  const file=makeImage('image/png');file.fail=true;
  const p=pasteEvent([raster(file)]);
  api.handleEditorImagePaste(p.event);
  assert.equal(p.prevented(),1);
  assert.equal(editor.value,'safe');
  assert.equal(track.history,0);
  assert.deepEqual(track.toasts,['toastImageReadFailed']);
});

test('Async image paste preserves original selection when editor is unchanged',()=>{
  const {api,editor,track}=harness({defer:true});
  editor.value='start SELECT end';
  editor.setSelectionRange(6,12);
  const p=pasteEvent([raster(makeImage('image/webp','G'.repeat(300)))]);
  api.handleEditorImagePaste(p.event);
  assert.equal(editor.value,'start SELECT end');
  assert.equal(typeof track.finishRead,'function');
  track.finishRead();
  assert.match(api.getMarkdown(),/^start !\[image\]\(data:image\/webp;base64,G{300}\) end$/);
});

test('Async paste never replaces text entered after the clipboard event',()=>{
  const {api,editor,track}=harness({defer:true});
  editor.value='first ';
  editor.setSelectionRange(6,6);
  const p=pasteEvent([raster(makeImage('image/png','Z'.repeat(300)))]);
  api.handleEditorImagePaste(p.event);
  editor.value+='typed';
  editor.setSelectionRange(editor.value.length,editor.value.length);
  track.finishRead();
  assert.match(api.getMarkdown(),/^first typed!\[image\]\(data:image\/png;base64,Z{300}\)$/);
});

test('Clipboard image uses only native APIs and all translations are present',()=>{
  assert.match(html,/editor\.addEventListener\('paste', handleEditorImagePaste\)/);
  assert.match(paste[1],/event\.clipboardData/);
  assert.match(paste[1],/new FileReader\(\)/);
  assert.match(paste[1],/readAsDataURL\(file\)/);
  assert.match(paste[1],/collapseImageData\(dataUrl\)/);
  assert.equal((i18n.match(/^    toastPasteImageUnsupported:/gm)||[]).length,10);
  assert.equal(existsSync('package.json'),false);
  assert.equal(existsSync('node_modules'),false);
});
