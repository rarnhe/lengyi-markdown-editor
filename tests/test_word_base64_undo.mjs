// Native Node.js regression tests: stable Base64 placeholders and Word HTML
// printable-area image sizing. No npm, external libraries, or frameworks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('markdown-editor.html','utf8');
const folding=html.match(/\/\/ Base64 folding BEGIN([\s\S]*?)\/\/ Base64 folding END/);
const history=html.match(/    function pushHistory\(\) \{[\s\S]*?    function formatBold\(\) \{/);
const keydown=html.match(/    function handleEditorKeydown\(e\) \{[\s\S]*?\n    \}/);
assert.ok(folding&&history&&keydown);

function createUndoHarness(){
  const editor={
    value:'',selectionStart:0,selectionEnd:0,
    setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;},
    focus(){}
  };
  const ctx=vm.createContext({
    editor,Map,clearTimeout:()=>{},setTimeout:()=>1,
    document:{getElementById:()=>({hidden:false,disabled:false,setAttribute(){}})},
    t:key=>key,showToast:()=>{},updatePreview:()=>{},updateCount:()=>{},
    autoSave:()=>{},formatBold:()=>{},formatUnderline:()=>{},
    formatItalic:()=>{},insertLink:()=>{},openImageModal:()=>{},
    openFindModal:()=>{}
  });
  const h=history[0].slice(0,history[0].lastIndexOf('    function formatBold() {'));
  const prelude='let historyStack=[], historyIndex=-1, lastHistoryText=null, historyTimer=null; const MAX_HISTORY=100;\n';
  vm.runInContext(folding[1]+'\n'+prelude+h+'\n'+keydown[0]+
    '\nthis.api={setMarkdown,getMarkdown,collapseImageData,toggleBase64,recordHistory,undo,redo,handleEditorKeydown,'+
    'getHistory:()=>historyStack,getImageDataMap:()=>imageDataMap};'+
    '\nthis.initHistory=()=>{historyStack=[createHistorySnapshot()];historyIndex=0;lastHistoryText=editor.value;};',ctx);
  return {api:ctx.api,editor,initHistory:ctx.initHistory};
}

function image(i){
  return '![图'+i+'](data:image/png;base64,'+'A'.repeat(256)+i.toString(16)+')';
}
function marker(text){
  const m=text.match(/⟦Base64图片#\d+已折叠⟧/g);
  return m||[];
}
function shortcut(api,key='z',shiftKey=false){
  let prevented=false;
  api.handleEditorKeydown({ctrlKey:true,metaKey:false,key,shiftKey,
    preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
}

test('Ctrl+Z and Ctrl+Y reuse exactly the same visible Base64 identifier',()=>{
  const {api,editor,initHistory}=createUndoHarness();
  const doc1='# Title\n\n'+image(28);
  api.setMarkdown(doc1);
  initHistory();
  const initial=editor.value;
  const initialId=marker(initial)[0];
  assert.ok(initialId);

  api.setMarkdown(doc1+'\n\nNew paragraph');
  api.recordHistory();
  assert.equal(marker(editor.value)[0],initialId);
  shortcut(api,'z');
  assert.equal(editor.value,initial,'undo must keep exact folded text');
  assert.equal(api.getMarkdown(),doc1);
  shortcut(api,'y');
  assert.equal(marker(editor.value)[0],initialId);
  assert.equal(api.getMarkdown(),doc1+'\n\nNew paragraph');
});

test('after 30 images Ctrl+Z never renumbers #28 or other unchanged images',()=>{
  const {api,editor,initHistory}=createUndoHarness();
  const doc=Array.from({length:30},(_,i)=>image(i)).join('\n');
  api.setMarkdown(doc);
  initHistory();
  const originalFolded=editor.value;
  const ids=marker(originalFolded);
  assert.equal(ids.length,30);
  assert.equal(ids[27],'⟦Base64图片#28已折叠⟧');

  api.setMarkdown(doc+'\n\nAdded text');
  api.recordHistory();
  api.setMarkdown(doc+'\n\nAdded text\n\nSecond edit');
  api.recordHistory();
  shortcut(api,'z');
  shortcut(api,'z');
  assert.equal(editor.value,originalFolded);
  assert.deepEqual(marker(editor.value),ids);
  assert.equal(api.getMarkdown(),doc);
  shortcut(api,'y');
  shortcut(api,'y');
  assert.deepEqual(marker(editor.value),ids);
  api.toggleBase64();
  assert.equal(editor.value,doc+'\n\nAdded text\n\nSecond edit');
  api.toggleBase64();
  assert.deepEqual(marker(editor.value),ids);
});

test('same image URI keeps its existing marker after deletion and history restore',()=>{
  const {api,editor,initHistory}=createUndoHarness();
  const doc='# Album\n'+image(1)+'\n'+image(2);
  api.setMarkdown(doc);
  initHistory();
  const ids=marker(editor.value);
  api.setMarkdown('# Album\n'+image(2));
  api.recordHistory();
  assert.equal(marker(editor.value)[0],ids[1]);
  shortcut(api,'z');
  assert.deepEqual(marker(editor.value),ids);
  shortcut(api,'y');
  assert.equal(marker(editor.value)[0],ids[1]);
  shortcut(api,'z');
  assert.equal(api.getMarkdown(),doc);
});

test('identical image URI shares a stable identity without losing either picture',()=>{
  const {api,editor}=createUndoHarness();
  const same=image(1);
  api.setMarkdown(same+'\n'+same);
  const ids=marker(editor.value);
  assert.equal(ids.length,2);
  assert.equal(ids[0],ids[1],'identical bytes reuse the same identity');
  assert.equal(api.getMarkdown(),same+'\n'+same);
  api.setMarkdown(same+'\n'+same);
  assert.deepEqual(marker(editor.value),ids);
});

test('new clipboard/image insertion receives a new ID, older image remains stable',()=>{
  const {api,editor}=createUndoHarness();
  api.setMarkdown(image(1));
  const first=marker(editor.value)[0];
  const inserted=api.collapseImageData('data:image/jpeg;base64,'+'B'.repeat(300)).text;
  assert.match(inserted,/⟦Base64图片#\d+已折叠⟧/);
  assert.notEqual(inserted,first);
  editor.value+='\n![new]('+inserted+')';
  assert.ok(api.getMarkdown().includes('data:image/jpeg;base64,'));
  assert.equal(marker(editor.value)[0],first);
});

const sizing=html.match(/    function wordPageImageSize\([\s\S]*?\n    \}/);
const fitting=html.match(/    async function fitDocImagesToTextWidth\([\s\S]*?\n    \}/);
const word=html.match(/    async function exportWord\(\) \{[\s\S]*?\n    \}/);
assert.ok(sizing&&fitting&&word);

test('Word printable A4 text width is exactly 15.92cm regardless of original image size',()=>{
  const ctx=vm.createContext({});
  vm.runInContext(sizing[0]+'\nthis.size=wordPageImageSize;',ctx);
  for(const [w,h] of [[1920,1080],[640,480],[400,1600],[120,60]]){
    const size=ctx.size(w,h);
    assert.equal(size.widthCm,'15.92');
    assert.equal(size.widthPx,Math.round(15.92/2.54*96));
    assert.ok(Math.abs(Number(size.heightCm)/15.92-h/w)<0.00002,
      'height must follow original aspect ratio');
    assert.ok(Math.abs(size.heightPx/size.widthPx-h/w)<0.01);
  }
  assert.equal(ctx.size(0,10),null);
  assert.equal(ctx.size(100,Infinity),null);
});

test('very tall images retain original aspect: no fixed max height and no cropping',()=>{
  const ctx=vm.createContext({});
  vm.runInContext(sizing[0]+'\nthis.size=wordPageImageSize;',ctx);
  const portrait=ctx.size(400,2000);
  assert.equal(portrait.widthCm,'15.92');
  assert.equal(portrait.heightCm,'79.6000');
  assert.ok(Number(portrait.heightCm)>29.7,
    'height is deliberately not reduced to a fixed A4 page height');
  assert.match(word[0],/@page WordSection1 \{ size: 21cm 29\.7cm; margin: 2\.54cm 2\.54cm 2\.54cm 2\.54cm; \}/);
  assert.match(word[0],/div\.WordSection1 \{ page: WordSection1; \}/);
  assert.doesNotMatch(word[0],/max-height:\s*22cm/);
  assert.match(word[0],/await fitDocImagesToTextWidth\(bodyHtml\)/);
});

test('Word HTML emits physical width and proportional height in attributes and CSS',async()=>{
  const created=[];
  class FakeImage{
    set src(value){
      this.naturalWidth=value.includes('portrait')?400:1920;
      this.naturalHeight=value.includes('portrait')?2000:1080;
      queueMicrotask(()=>this.onload());
    }
  }
  function element(src){
    const attrs={src}, css={};
    const obj={
      attrs,css,
      getAttribute:key=>attrs[key]||null,
      setAttribute(key,value){attrs[key]=value;},
      removeAttribute(key){delete attrs[key];},
      style:{setProperty(key,value){css[key]=value;}}
    };
    created.push(obj);return obj;
  }
  const images=[element('data:image/png;base64,AAAA'),element('data:image/png;base64,portrait')];
  const body={innerHTML:'<p>rendered images</p>',querySelectorAll(){return images;}};
  const ctx=vm.createContext({
    DOMParser:class{parseFromString(){return {body};}},
    Image:FakeImage,Number,Math,Promise,queueMicrotask,setTimeout,clearTimeout
  });
  vm.runInContext(sizing[0]+'\n'+fitting[0]+'\nthis.fit=fitDocImagesToTextWidth;',ctx);
  assert.match(await ctx.fit('<p>...</p>'),/rendered images/);
  for(const el of created){
    assert.equal(el.attrs.width,String(Math.round(15.92/2.54*96)));
    assert.equal(el.css.width,'15.92cm');
    assert.equal(el.css['max-width'],'none');
    assert.equal(el.css['max-height'],'none');
    assert.equal(el.css.display,'block');
    assert.equal(el.css['margin-left'],'0');
    assert.equal(el.css['margin-right'],'0');
  }
  assert.equal(created[0].css.height,(15.92*1080/1920).toFixed(4)+'cm');
  assert.equal(created[1].css.height,'79.6000cm');
  assert.equal(created[1].attrs.height,
    String(Math.round(79.6/2.54*96)));
});


test('history snapshots and edits store folded text patches, never duplicate Base64 payloads',()=>{
  const {api,editor,initHistory}=createUndoHarness();
  const payload='A'.repeat(1024*1024);
  const dataUrl='data:image/png;base64,'+payload;
  const doc='# Large document\n\n![image]('+dataUrl+')\n\nText';
  api.setMarkdown(doc);
  initHistory();
  const base=api.getHistory()[0];
  const imageMarker=marker(editor.value)[0];
  assert.equal(base.type,'snapshot');
  assert.equal(base.text,editor.value);
  assert.ok(base.text.length<doc.length/100);
  assert.equal(base.text.includes('data:image/'),false);
  assert.equal(base.imageData.get(imageMarker),api.getImageDataMap().get(imageMarker));

  editor.value+='\nsmall edit';
  api.recordHistory();
  const patch=api.getHistory()[1];
  assert.equal(patch.type,'patch');
  assert.equal(patch.removed,'');
  assert.equal(patch.inserted,'\nsmall edit');
  assert.equal(patch.inserted.includes('data:image/'),false);
  assert.equal(patch.removed.includes('data:image/'),false);
  assert.equal(patch.imageData.get(imageMarker),api.getImageDataMap().get(imageMarker));
  assert.equal(api.getHistory().length,2);
});

test('incremental history can undo and redo text and image-resource references',()=>{
  const {api,editor,initHistory}=createUndoHarness();
  const doc='# Album\n'+image(1)+'\n'+image(2);
  api.setMarkdown(doc);
  initHistory();
  const initial=editor.value;
  const ids=marker(initial);

  editor.value=initial.replace('![图1]('+ids[0]+')\n','');
  api.recordHistory();
  const withoutFirst=editor.value;
  assert.equal(api.getImageDataMap().has(ids[0]),true);
  shortcut(api,'z');
  assert.equal(editor.value,initial);
  assert.equal(api.getMarkdown(),doc);
  shortcut(api,'y');
  assert.equal(editor.value,withoutFirst);
  assert.equal(api.getMarkdown(),doc.replace(image(1)+'\n',''));
  shortcut(api,'z');
  assert.equal(editor.value,initial);
  assert.deepEqual(marker(editor.value),ids);
});

test('history limit folds the oldest patch into its base snapshot without losing undo/redo',()=>{
  const {api,editor,initHistory}=createUndoHarness();
  api.setMarkdown('');
  initHistory();
  let expected='';
  for(let i=0;i<105;i++){
    const char=String(i%10);
    editor.value+=char;
    expected+=char;
    api.recordHistory();
  }
  const history=api.getHistory();
  assert.equal(history.length,101,'one base snapshot plus 100 patches');
  assert.equal(history[0].type,'snapshot');
  assert.equal(history[0].text,expected.slice(0,5));
  for(let i=0;i<100;i++)shortcut(api,'z');
  assert.equal(editor.value,expected.slice(0,5));
  for(let i=0;i<100;i++)shortcut(api,'y');
  assert.equal(editor.value,expected);
});
