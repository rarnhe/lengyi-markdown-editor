// Node built-in regression tests for native SVG image connections (no npm).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync('markdown-editor.html','utf8');
const i18n=readFileSync('i18n.js','utf8');
const extract=name=>{
  const found=html.match(new RegExp('function '+name+'\\([^]*?\\n    \\}'));
  assert.ok(found,'missing function: '+name);return found[0];
};
const run=(source,name,ctx={})=>vm.runInNewContext(source+'\nthis.exposed='+name+';',ctx);

test('read-only folded state appears after Edit, not a toggle',()=>{
  const head=html.match(/<div class="editor-heading">([^]*?)<\/div>/);
  assert.match(head[1],/data-i18n="editorPaneTitle"[^]*?<span id="base64-status"[^>]*role="status"/);
  assert.doesNotMatch(head[1],/onclick|base64-toggle|<button/);
  assert.equal((i18n.match(/^    base64FoldedStatus:/gm)||[]).length,10);
  assert.match(html,/#image-link-overlay \{[^]*?pointer-events: none;/);
});

test('Markdown image scanner skips fenced code and finds Base64, remote images',()=>{
  const scan=run(extract('findImageSourceRows'),'findImageSourceRows');
  const fence='\x60\x60\x60';
  const src=['# intro','![a](⟦Base64图片#1已折叠⟧)',
    fence+'md','![fake](https://example.com/ignored.png)',fence,
    '![remote](https://example.com/p.jpg)'].join('\n');
  const rows=Array.from(scan(src));
  assert.equal(rows.length,2);
  assert.equal(rows[0].source,'⟦Base64图片#1已折叠⟧');
  assert.equal(rows[1].source,'https://example.com/p.jpg');
  assert.equal(src.slice(rows[0].start,rows[0].end),'![a](⟦Base64图片#1已折叠⟧)');
});

test('source measurement caches mirror geometry during scrolling and refreshes on width changes',()=>{
  let created=0,appended=0;
  const editor={value:'![a](⟦Base64图片#1已折叠⟧)\nnext',clientWidth:420,
    parentElement:{appendChild(){appended++;}}};
  const doc={
    createElement(type){
      created++;
      if(type==='span')return {style:{},getBoundingClientRect(){return {top:150};}};
      return {style:{},appendChild(){},getBoundingClientRect(){return {top:100};},remove(){}};
    },
    createTextNode(text){return {textContent:text};}
  };
  const ctx={editor,document:doc,imageLinkLayout:{value:null,width:-1,rows:[]},
    getComputedStyle:()=>({fontSize:'16px',lineHeight:'28px',padding:'28px 32px'})};
  const measure=run(extract('findImageSourceRows')+'\n'+extract('measureImageSourceRows'),
    'measureImageSourceRows',ctx);
  assert.equal(measure().length,1);
  const count=created;
  measure();assert.equal(created,count);assert.equal(appended,1);
  editor.clientWidth=401;
  measure();assert.equal(appended,2);
});

function fixture(opts={}){
  const data='data:image/png;base64,'+'A'.repeat(180);
  const token='⟦Base64图片#1已折叠⟧';
  const shapes=[];
  const overlay={setAttribute(){},replaceChildren(){shapes.length=0;},
    appendChild(el){shapes.push(el);}};
  const editor={scrollTop:opts.offEditor?700:0,getBoundingClientRect(){
    return {left:0,right:480,top:42,bottom:542,width:480};}};
  const image={getAttribute(){return opts.wrongSrc?'different':data;},
    getBoundingClientRect(){return {left:540,right:820,top:opts.offImage?600:150,
      bottom:opts.offImage?800:300};}};
  const preview={querySelectorAll(){return [image];},
    getBoundingClientRect(){return {left:488,right:960,top:42,bottom:542,width:472};}};
  const ctx={imageLinkOverlay:overlay,SVG_NS:'http://www.w3.org/2000/svg',
    readingMode:!!opts.readingMode,editorCollapsed:!!opts.collapsed,
    imageDataCollapsed:true,editor,preview,window:{matchMedia:()=>({matches:!!opts.mobile})},
    document:{
      baseURI:'file:///markdown-editor.html',
      querySelector(){return {getBoundingClientRect(){return {
        left:0,top:0,width:1100,height:600};}};},
      createElementNS(ns,tag){return {tag,attrs:{},
        setAttribute(key,value){this.attrs[key]=String(value);}};}
    },
    measureImageSourceRows(){return [{start:0,end:30,source:token,startY:140,endY:170}];},
    expandImageData:s=>s===token?data:s,
    getComputedStyle:()=>({paddingLeft:'32px',paddingRight:'32px'}),
    URL
  };
  const funcs=['imageSourcesMatch','imageLinkSvgElement','drawImageConnections']
    .map(extract).join('\n');
  return {draw:run(funcs,'drawImageConnections',ctx),shapes};
}

test('matching images draw two green highlights and one tapered VS Code-style connector',()=>{
  const f=fixture();f.draw();
  assert.equal(f.shapes.length,3);
  assert.deepEqual(f.shapes.map(x=>x.tag),['rect','path','rect']);
  assert.match(f.shapes[0].attrs.fill,/54, 175, 102/);
  assert.match(f.shapes[1].attrs.d,/^M /);
  assert.match(f.shapes[1].attrs.fill,/57, 169, 97/);
  assert.equal(f.shapes[0].attrs.x,'32');
});

test('unmatched/offscreen images, reading, collapsed and mobile views omit links',()=>{
  for(const options of [{wrongSrc:true},{offEditor:true},{offImage:true},
    {readingMode:true},{collapsed:true},{mobile:true}]){
    const f=fixture(options);f.draw();
    assert.equal(f.shapes.length,0,JSON.stringify(options));
  }
});

test('connections update on scroll, image load, rendering and pane resizing',()=>{
  const src=html.slice(html.indexOf('// Image compare links BEGIN'),
    html.indexOf('// Image compare links END'));
  assert.match(src,/editor\.addEventListener\('scroll',scheduleImageConnections/);
  assert.match(src,/preview\.addEventListener\('scroll',scheduleImageConnections/);
  assert.match(src,/preview\.addEventListener\('load'/);
  assert.match(src,/new ResizeObserver\(scheduleImageConnections\)/);
  assert.match(html,/renderOutline\(\);\s*updatePreviewProgress\(\);\s*observeImageBody\(\);\s*scheduleImageConnections\(\);/);
  assert.match(html,/function applySplit\(\) \{[^]*?updateFilenameLimit\(\);\s*scheduleImageConnections\(\);/);
});
