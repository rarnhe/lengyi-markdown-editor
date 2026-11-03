// Native browser Word export and optional Pandoc presence tests. No npm modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html = readFileSync('markdown-editor.html','utf8');
const i18n = readFileSync('i18n.js','utf8');
const getFunction = name => {
  const block = html.match(new RegExp('(async )?function '+name+'\\([^]*?\\n    \\}'));
  assert.ok(block,'function '+name+' exists');
  return block[0];
};

test('doc dimensions fill available A4 text width and preserve aspect ratio',()=>{
  const ctx = vm.createContext({});
  vm.runInContext(getFunction('wordImageDimensions')+
    '\nthis.size = wordImageDimensions;',ctx);
  const landscape = ctx.size(1920,1080);
  assert.equal(landscape.width,Math.round(17/2.54*96));
  assert.ok(Math.abs(landscape.width/landscape.height - 1920/1080) < 0.01);
  const portrait = ctx.size(600,1600);
  assert.equal(portrait.height,Math.round(22/2.54*96));
  assert.ok(Math.abs(portrait.width/portrait.height - 600/1600)<0.01);
  assert.equal(ctx.size(0,500),null);
});

test('Word image markup has explicit width/height attributes and inline CSS',async()=>{
  const loaded=[];
  const makeImage = source => {
    const attrs={src:source};
    const styles={}, image = {
      style: {setProperty(key,value){styles[key]=value;}},
      getAttribute:key=>attrs[key]||null,
      setAttribute(key,value){attrs[key]=value;},
      attrs,styles
    };
    loaded.push(image);
    return image;
  };
  const images=[
    makeImage('data:image/png;base64,iVBORw0KGgo='),
    makeImage('data:image/png;base64,iVBORw0KGgo=')
  ];
  const doc = {body:{querySelectorAll:()=>images,innerHTML:'<img>two pictures</img>'}};
  class FakeImage {
    set src(value) {
      this.naturalWidth = value.includes('base64')?1920:800;
      this.naturalHeight = 1080;
      queueMicrotask(()=>this.onload());
    }
  }
  const ctx=vm.createContext({DOMParser:class {parseFromString(){return doc;}},
    Image:FakeImage, setTimeout,clearTimeout,queueMicrotask,Math});
  vm.runInContext(getFunction('wordImageDimensions')+'\n'+getFunction('fitWordImages')+
    '\nthis.fit=fitWordImages;',ctx);
  const markup=await ctx.fit('<img><img>');
  assert.match(markup,/two pictures/);
  for(const image of loaded) {
    assert.equal(image.attrs.width,String(Math.round(17/2.54*96)));
    assert.ok(Number(image.attrs.height)>0);
    assert.equal(image.styles.width,image.attrs.width+'px');
    assert.equal(image.styles.height,image.attrs.height+'px');
  }
});

test('legacy DOC uses image normalizer, page margins and Word-safe image dimensions',()=>{
  const src=getFunction('exportWord');
  assert.match(src,/await fitWordImages\(bodyHtml\)/);
  assert.match(src,/@page \{ size: A4; margin: 2cm; \}/);
  assert.match(src,/max-width: 17cm/);
  assert.match(src,/application\/msword/);
  assert.match(src,/\.doc/);
});

function createPandocContext(fetchImpl){
  const item={style:{display:'none'}},urls=[],downloads=[],toasts=[];
  const ctx=vm.createContext({
    document:{
      getElementById:key=>key==='export-docx-item'?item:null,
      createElement:()=>({click(){downloads.push(this.download);},remove(){}}),
      body:{appendChild(){}}
    },
    filenameInput:{value:'sample.md'},
    fetch:fetchImpl,AbortController,setTimeout,clearTimeout,
    URL:{createObjectURL:blob=>{urls.push(blob);return 'blob:sample';},revokeObjectURL(){}},
    getMarkdown:()=> '# Hello\n\n![image](data:image/png;base64,AAA)',
    showToast:message=>toasts.push(message),
    t:(key,...args)=>key+(args.length?':'+args[0]:'')
  });
  const body=html.slice(html.indexOf('    // Optional Pandoc converter served by the EXISTING local Python proxy.'),
    html.indexOf('    // 导出 Word：',html.indexOf('    // Optional Pandoc converter')));
  vm.runInContext(body+'\nthis.api = {refreshPandocAvailability,exportDocx};',ctx);
  return {ctx,item,urls,downloads,toasts};
}

test('DOCX menu starts hidden, appears only if local Python and pandoc available',async()=>{
  const positive=createPandocContext(async()=>({ok:true,json:async()=>({
    available:true,token:'abcdefghijklmnopqrstuvwxyz0123456789'
  })}));
  assert.equal(positive.item.style.display,'none');
  assert.equal(await positive.ctx.api.refreshPandocAvailability(),true);
  assert.equal(positive.item.style.display,'');
  const noPandoc=createPandocContext(async()=>({ok:true,json:async()=>({
    available:false,token:null
  })}));
  assert.equal(await noPandoc.ctx.api.refreshPandocAvailability(),false);
  assert.equal(noPandoc.item.style.display,'none');
  const noProxy=createPandocContext(async()=>{throw Error('connection refused')});
  assert.equal(await noProxy.ctx.api.refreshPandocAvailability(),false);
  assert.equal(noProxy.item.style.display,'none');
});

test('DOCX export sends Markdown to local Python with one-time token and downloads the blob',async()=>{
  const calls=[],token='abcdefghijklmno0123456789zyx';
  const h=createPandocContext(async(url,opts)=>{
    calls.push({url,opts});
    if(url.endsWith('/status'))return {ok:true,json:async()=>({available:true,token})};
    return {ok:true,blob:async()=>({kind:'docx'})};
  });
  await h.ctx.api.exportDocx();
  assert.equal(calls.length,2);
  assert.equal(calls[1].opts.method,'POST');
  assert.equal(calls[1].opts.headers['X-Lengyi-Token'],token);
  assert.match(calls[1].opts.headers['Content-Type'],/application\/json/);
  assert.match(JSON.parse(calls[1].opts.body).markdown,/!\[image\]\(data:image/);
  assert.deepEqual(h.downloads,['sample.docx']);
  assert.deepEqual(h.toasts,['toastDocxExporting','toastDocxExported']);
});

test('Export menu has a hidden Pandoc item and availability is checked on opening',()=>{
  assert.match(html,/id="export-docx-item" style="display:none"/);
  assert.match(html,/function toggleExportMenu\(\) \{[^]*?refreshPandocAvailability\(\)/);
  for(const key of ['exportDocx','toastDocxExporting','toastDocxExported',
    'toastDocxFailed','toastDocxUnavailable']){
    assert.equal((i18n.match(new RegExp('^    '+key+':','gm'))||[]).length,10,key);
  }
});
