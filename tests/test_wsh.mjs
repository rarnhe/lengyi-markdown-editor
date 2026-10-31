// Runs the REAL compilation and the REAL Windows Script Host executable.
// Node.js is the test/build harness only, not a deployed runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const tsconfig = JSON.parse(readFileSync('tsconfig.wsh.json', 'utf8'));
const buildScript = readFileSync('scripts/build-wsh.mjs', 'utf8');

test('build tooling is exclusively development-time, not a Node runtime dependency', () => {
  assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ['esbuild','typescript']);
  assert.equal(tsconfig.compilerOptions.target, 'ES5');
  assert.equal(tsconfig.compilerOptions.module, 'none');
  assert.equal(tsconfig.compilerOptions.outFile, '.wsh-build/web-to-md.es5.js');
  assert.match(buildScript, /node_modules\/typescript\/bin\/tsc/);
  assert.match(buildScript, /--target=es5/);
  assert.match(buildScript, /node_modules\/esbuild\/bin\/esbuild/);
  assert.match(buildScript, /--outfile=dist\/web-to-md\.js/);
});

test('tsc ES5 -> esbuild target es5 produces executable dist/web-to-md.js', () => {
  const result = spawnSync(process.execPath, ['scripts/build-wsh.mjs'],
    { encoding:'utf8', timeout:120000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /WSH_BUILD_OK dist\/web-to-md\.js/);
  const built = readFileSync('dist/web-to-md.js', 'utf8');
  const intermediate = readFileSync('.wsh-build/web-to-md.es5.js', 'utf8');
  assert.match(built, /WSH_SELF_TEST_OK/);
  assert.ok(built.length > 1000);
  assert.ok(intermediate.length > 1000);
  for (const [name,source] of [['tsc',intermediate],['esbuild',built]]) {
    assert.doesNotMatch(source, /(?:^|[;\s])(?:const|let|class|import|export)\s/m, name);
    assert.doesNotMatch(source, /=>/, name);
  }
  const syntax = spawnSync(process.execPath,['--check','dist/web-to-md.js'],
    { encoding:'utf8' });
  assert.equal(syntax.status,0,syntax.stderr);
});


test('existing editor delegates optional dynamic rendering to local WSH proxy', () => {
  const html = readFileSync('markdown-editor.html', 'utf8');
  const i18n = readFileSync('i18n.js', 'utf8');
  assert.match(html, /id="browser-render"/);
  assert.match(html, /id="browser-render-row"/);
  assert.match(html, /data-i18n="browserRender"/);
  assert.match(html, /document\.getElementById\('browser-render'\)\.checked \? '&mode=browser' : ''/);
  assert.match(html, /id="proxy-url" value="http:\/\/127.0.0.1:8765\/fetch"/);
  assert.equal((i18n.match(/^    browserRender:/gm)||[]).length, 10);
  assert.doesNotMatch(html, /web-to-md-proxy\.py/);
});

test('Windows runtime contains WebDriver and legacy JSON compatibility without Node imports', () => {
  const compiled = readFileSync('dist/web-to-md.js','utf8');
  assert.match(compiled, /WinHttp\.WinHttpRequest\.5\.1/);
  assert.match(compiled, /MSXML2\.ServerXMLHTTP\.6\.0/);
  assert.match(compiled, /msedgedriver\.exe/);
  assert.match(compiled, /javascript:/);
  assert.doesNotMatch(compiled, /\brequire\s*\(|\bprocess\.|\bmodule\.exports\b/);
});

test('Windows runner executes cscript //nologo dist\\web-to-md.js --self-test successfully', t => {
  if (process.platform !== 'win32') return t.skip('requires Windows WSH');
  assert.ok(existsSync('dist/web-to-md.js'));
  const result = spawnSync('cscript.exe', ['//nologo', 'dist\\web-to-md.js', '--self-test'],
    { encoding:'utf8', timeout:30000 });
  assert.equal(result.status, 0, (result.stdout||'')+(result.stderr||''));
  assert.match(result.stdout, /WSH_SELF_TEST_OK/);
});

test('Windows cscript rejects loopback targets and exposes browser bookmarklet', t => {
  if (process.platform !== 'win32') return t.skip('requires Windows WSH');
  const blocked = spawnSync('cscript.exe',
    ['//nologo','dist\\web-to-md.js','--once','http://127.0.0.1:8765/secret'],
    { encoding:'utf8', timeout:30000 });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stdout, /WSH_ERROR:.*(?:blocked|unsupported)/i);
  const bookmark = spawnSync('cscript.exe',
    ['//nologo','dist\\web-to-md.js','--bookmark'],
    { encoding:'utf8', timeout:30000 });
  assert.equal(bookmark.status, 0, bookmark.stdout+bookmark.stderr);
  assert.match(bookmark.stdout, /javascript:/);
});

test('Windows loopback HTTP bridge serves /health and sends /fetch to cscript', async t => {
  if (process.platform !== 'win32') return t.skip('requires Windows WSH');
  const child = spawn('cscript.exe', ['//nologo','dist\\web-to-md.js','--serve'],
    { windowsHide:true, stdio:'ignore' });
  const origin = 'http://127.0.0.1:8765';
  async function get(path) {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(),3000);
    try { return await fetch(origin+path,{signal:controller.signal}); }
    finally { clearTimeout(timer); }
  }
  try {
    let ready = false;
    for (let i=0;i<35;i++) {
      if (child.exitCode !== null) break;
      await new Promise(r=>setTimeout(r,350));
      try {
        const res=await get('/health');
        if (res.ok) { assert.equal((await res.json()).engine,'cscript'); ready=true; break; }
      } catch {}
    }
    assert.equal(ready,true,'HTTP bridge failed to listen (check URL ACL/PowerShell)');
    const response=await get('/fetch?url='+encodeURIComponent('http://127.0.0.1:8765/secret'));
    const data=await response.json();
    assert.equal(data.success,false);
    assert.match(data.error,/(?:blocked|unsupported)/i);
  } finally {
    child.kill();
  }
});
