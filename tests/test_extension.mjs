import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
const workerSource = readFileSync('extension/background.js', 'utf8');
const bridgeSource = readFileSync('extension/editor-bridge.js', 'utf8');
const html = readFileSync('markdown-editor.html', 'utf8');
const i18n = readFileSync('i18n.js', 'utf8');

function workerHarness(fetchImpl = async url => ({
  ok: true, url, headers: {get:()=> 'text/html; charset=utf-8'},
  text: async () => '<html><body><article>Static capture works</article></body></html>'
})) {
  const state = { handler: null, injected: null, created: null };
  const listeners = {updated:new Set(),removed:new Set()};
  const chrome = {
    runtime: {onMessage:{addListener(fn){state.handler=fn;}}},
    tabs: {
      create:async options=>{state.created=options;return {id:41};},
      get:async()=>({status:'complete'}),
      onUpdated:{addListener:fn=>listeners.updated.add(fn),removeListener:fn=>listeners.updated.delete(fn)},
      onRemoved:{addListener:fn=>listeners.removed.add(fn),removeListener:fn=>listeners.removed.delete(fn)}
    },
    scripting: {executeScript:async opts=>{state.injected=opts;return [{result:{
      success:true,html:'<!doctype html><html><head><title>Rendered</title></head><body><article>Rendered article</article></body></html>',
      title:'Rendered',finalUrl:state.created.url,mode:'browser'
    }}];}}
  };
  vm.runInNewContext(workerSource,{chrome,URL,fetch:fetchImpl,AbortController,setTimeout,clearTimeout,location:{href:'https://example.com/'}},{filename:'extension/background.js'});
  function ask({url='https://mp.weixin.qq.com/s/demo',mode='static',type='FETCH'}={}, sender={
    tab:{id:5},frameId:0,url:'file:///C:/editor/markdown-editor.html'
  }) {
    return new Promise(resolve=>{
      const accepted = state.handler({channel:'lengyi-extension-v1',requestId:'unit',type,url,mode},sender,resolve);
      if (!accepted) resolve({ignored:true});
    });
  }
  return {state,ask};
}

test('Manifest V3 uses only browser APIs, not localhost service, native messaging or runtime npm modules',()=>{
  assert.equal(manifest.manifest_version,3);
  assert.equal(manifest.background.service_worker,'background.js');
  assert.deepEqual(manifest.permissions.sort(),['scripting','tabs']);
  assert.ok(manifest.host_permissions.includes('https://*/*'));
  assert.ok(manifest.host_permissions.includes('http://*/*'));
  assert.deepEqual(manifest.content_scripts[0].js,['editor-bridge.js']);
  for (const match of ['file:///*','http://localhost/*','http://127.0.0.1/*']) {
    assert.ok(manifest.content_scripts[0].matches.includes(match),match);
  }
  assert.equal(manifest.externally_connectable,undefined);
  assert.equal(existsSync('web-to-md-proxy.py'),false);
  assert.equal(existsSync('package.json'),false);
  for (const source of [workerSource,bridgeSource,html]) {
    assert.doesNotMatch(source, /http:\/\/(?:localhost|127\.0\.0\.1):8765|api\.allorigins\.win|api\.codetabs\.com|web-to-md-proxy\.py/);
  }
});

test('Editor uses extension only and retains the HTML-to-Markdown/manual HTML path',()=>{
  assert.match(html, /id="web-fetch-mode"/);
  assert.match(html, /value="browser"/);
  assert.match(html, /value="static"/);
  assert.match(html, /function extensionRequest\(/);
  assert.match(html, /await extensionRequest\('PING'/);
  assert.match(html, /await extensionRequest\('FETCH'/);
  assert.match(html, /function convertAndInsert\(/);
  assert.match(html, /document\.getElementById\('manual-html'\)\.value/);
  for (const key of ['extensionModeLabel','extensionModeBrowser','extensionModeStatic',
    'extensionHint','urlStatusExtensionSuccess','urlStatusExtensionFailed','urlStatusExtensionMissing']) {
    assert.equal((i18n.match(new RegExp('^    '+key+':','gm'))||[]).length,10,key);
  }
});

test('Service worker rejects non-editor senders, unexpected events and unsafe URLs',async()=>{
  const h=workerHarness();
  const external = await h.ask({}, {tab:{id:5},frameId:0,url:'https://evil.example/markdown-editor.html'});
  assert.equal(external.ignored,true);
  const subframe = await h.ask({}, {tab:{id:5},frameId:1,url:'file:///C:/markdown-editor.html'});
  assert.equal(subframe.ignored,true);
  const wrongType=await h.ask({type:'OTHER'});
  assert.equal(wrongType.ignored,true);
  for(const bad of ['file:///etc/passwd','http://localhost/secret','http://127.0.0.1/',
    'http://10.0.0.1/','http://192.168.0.1/','https://user:pass@example.com/',
    'http://169.254.169.254/latest/meta-data/','http://example.com:2222/a']) {
    const result=await h.ask({url:bad});
    assert.equal(result.success,false,bad);
  }
});

test('Static mode fetches via extension with omitted credentials and returns HTML',async()=>{
  const seen=[];
  const h=workerHarness(async(url,options)=>{
    seen.push({url,options});
    return {ok:true,url,headers:{get:()=> 'text/html'},text:async()=> '<html><body>Safe static article</body></html>'};
  });
  const result=await h.ask({url:'https://example.com/article',mode:'static'});
  assert.equal(result.success,true);
  assert.match(result.html,/Safe static article/);
  assert.equal(seen.length,1);
  assert.equal(seen[0].options.credentials,'omit');
  assert.equal(h.state.created,null);
});

test('Browser mode opens a real tab and invokes extension-owned DOM extraction',async()=>{
  const h=workerHarness();
  const result=await h.ask({url:'https://example.com/article',mode:'browser'});
  assert.equal(result.success,true);
  assert.match(result.html,/Rendered article/);
  assert.equal(h.state.created.active,true);
  assert.equal(h.state.created.url,'https://example.com/article');
  assert.equal(h.state.injected.target.tabId,41);
  assert.equal(typeof h.state.injected.func,'function');
  assert.match(h.state.injected.func.toString(),/document\.querySelector/);
  assert.equal(h.state.injected.args[0],4*1024*1024);
});

test('Rendered DOM extractor returns sanitized article metadata and resolves relative links',async()=>{
  const h=workerHarness();
  await h.ask({url:'https://example.com/',mode:'browser'});
  const extractor=h.state.injected.func;
  const text='Article body with sufficient text. '.repeat(10);
  const anchor={
    attributes:[{name:'href',value:'/news/1'},{name:'onclick',value:'bad()'}],
    setAttribute(name,value){this.attributes=this.attributes.filter(a=>a.name!==name);this.attributes.push({name,value});},
    removeAttribute(name){this.attributes=this.attributes.filter(a=>a.name!==name);}
  };
  const copy={
    attributes:[],textContent:text,
    outerHTML:'<article><h1>Headline</h1><p>'+text+'</p></article>',
    querySelectorAll(sel){return sel==='*'?[anchor]:[];},
    removeAttribute(){},setAttribute(){}
  };
  const body={innerText:text,cloneNode(){return copy;}};
  const page={
    body,baseURI:'https://example.com/news/start',title:'Article title',
    querySelector(){return null;}
  };
  const sandbox={
    document:page,location:{href:'https://example.com/news/start'},URL,Date,
    setTimeout:fn=>{queueMicrotask(fn);return 1;}
  };
  const actual=vm.runInNewContext('('+extractor.toString()+')',sandbox);
  const result=await actual(4*1024*1024);
  assert.equal(result.success,true);
  assert.equal(result.title,'Article title');
  assert.match(result.html,/<title>Article title<\/title>/);
  assert.match(result.html,/<article>/);
  assert.equal(anchor.attributes.find(a=>a.name==='href').value,'https://example.com/news/1');
  assert.equal(anchor.attributes.some(a=>a.name==='onclick'),false);
});


test('Editor extensionRequest resolves a null-source reply on file pages without false missing warnings',async()=>{
  const start=html.indexOf('    function extensionRequest(');
  const end=html.indexOf('    async function fetchUrl()',start);
  assert.ok(start>0 && end>start);
  let handler;
  const pending=new Map();
  const win={
    addEventListener(name,fn){if(name==='message')handler=fn;},
    removeEventListener(name,fn){if(handler===fn)handler=null;},
    postMessage(data){
      if(data.command==='PING'){
        queueMicrotask(()=>handler({
          source:null,origin:'null',
          data:{channel:'lengyi-extension-v1',from:'extension',requestId:data.requestId,
            success:true,installed:true}
        }));
      }
    }
  };
  const root={hasAttribute:()=>true};
  const context={
    window:win,location:{protocol:'file:',origin:'null'},
    document:{documentElement:root},Date,Math,setTimeout,clearTimeout
  };
  const script=html.slice(start,end);
  const request=vm.runInNewContext(script+'\n extensionRequest;',context);
  const reply=await request('PING',{},500);
  assert.equal(reply.success,true);
  assert.equal(reply.installed,true);
});

test('Editor extensionRequest rejects cross-window and cross-origin forged replies',async()=>{
  const start=html.indexOf('    function extensionRequest(');
  const end=html.indexOf('    async function fetchUrl()',start);
  let handler;
  const win={
    addEventListener(name,fn){handler=fn;},
    removeEventListener(){},
    postMessage(data) {
      queueMicrotask(()=>{
        handler({source:{},origin:'null',data:{channel:'lengyi-extension-v1',from:'extension',requestId:data.requestId,success:true}});
        handler({source:null,origin:'https://evil.example',data:{channel:'lengyi-extension-v1',from:'extension',requestId:data.requestId,success:true}});
      });
    }
  };
  const request=vm.runInNewContext(html.slice(start,end)+'\n extensionRequest;',{
    window:win,location:{protocol:'file:',origin:'null'},
    document:{documentElement:{hasAttribute:()=>true}},
    Date,Math,setTimeout,clearTimeout
  });
  await assert.rejects(request('PING',{},45),/EXTENSION_TIMEOUT/);
});


test('Extension popup diagnoses file access and editor bridge injection',async()=>{
  const popup=readFileSync('extension/popup.html','utf8');
  const source=readFileSync('extension/popup.js','utf8');
  assert.match(popup, /<script src="popup\.js"><\/script>/);
  async function run({url,allowed=true,injected=true}) {
    const elements={status:{textContent:''},details:{textContent:''}};
    const chrome={
      tabs:{query:async()=>[{id:5,url}]},
      extension:{isAllowedFileSchemeAccess:fn=>fn(allowed)},
      scripting:{executeScript:async()=>[{result:injected}]}
    };
    const context={
      chrome,URL,
      document:{getElementById:key=>elements[key]},
      Promise
    };
    vm.runInNewContext(source,context,{filename:'extension/popup.js'});
    for(let i=0;i<12 && !elements.status.textContent;i++){
      await new Promise(resolve=>setImmediate(resolve));
    }
    return elements;
  }
  const fileOff=await run({url:'file:///C:/my/markdown-editor.html',allowed:false});
  assert.match(fileOff.status.textContent,/本地文件/);
  const injected=await run({url:'http://localhost:8080/markdown-editor.html',injected:true});
  assert.match(injected.status.textContent,/已注入/);
  const absent=await run({url:'http://127.0.0.1:8080/markdown-editor.html',injected:false});
  assert.match(absent.status.textContent,/未注入/);
  const unsupported=await run({url:'http://192.168.1.2:8080/markdown-editor.html'});
  assert.match(unsupported.status.textContent,/未被扩展授权/);
});

test('Content script replies to editor PING/FETCH through bounded message bridge',async()=>{
  const sent=[];
  let listener;
  const page={};
  const attributes={};
  const root={
    setAttribute(name,value){attributes[name]=value;},
    hasAttribute(name){return Object.prototype.hasOwnProperty.call(attributes,name);}
  };
  page.addEventListener=(event,fn)=>{if(event==='message')listener=fn;};
  page.postMessage=(response)=>sent.push(response);
  const runtime={sendMessage:async request=>({
    success:true,html:'<article>from extension</article>',requestId:request.requestId
  })};
  vm.runInNewContext(bridgeSource,{
    chrome:{runtime}, window:page,
    location:{pathname:'/my/markdown-editor.html',protocol:'file:',origin:'null'},
    document:{documentElement:root,getElementById:id=>id==='editor'||id==='url-modal'?{}:null},
    URL
  },{filename:'extension/editor-bridge.js'});
  assert.equal(typeof listener,'function');
  assert.equal(attributes['data-lengyi-extension-ready'],'1');
  // Real browser extension environments can provide a null MessageEvent.source.
  listener({source:null,origin:'null',data:{channel:'lengyi-extension-v1',from:'editor',requestId:'req1',command:'PING'}});
  assert.equal(sent[0].installed,true);
  listener({source:page,origin:'null',data:{channel:'lengyi-extension-v1',from:'editor',requestId:'req2',command:'FETCH',
    payload:{url:'https://example.com/',mode:'browser'}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sent[1].requestId,'req2');
  assert.match(sent[1].html,/from extension/);
  // Both a foreign WindowProxy and a foreign origin must be rejected.
  listener({source:{},origin:'null',data:{channel:'lengyi-extension-v1',from:'editor',requestId:'fake',command:'PING'}});
  listener({source:null,origin:'https://evil.example',data:{channel:'lengyi-extension-v1',from:'editor',requestId:'fake2',command:'PING'}});
  assert.equal(sent.length,2);
});
