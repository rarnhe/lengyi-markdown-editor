// Build-time only. The generated dist/web-to-md.js runs in cscript.exe.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

mkdirSync('.wsh-build', { recursive: true });
mkdirSync('dist', { recursive: true });
const node = process.execPath;
function run(args) { execFileSync(node, args, { stdio: 'inherit' }); }
run(['node_modules/typescript/bin/tsc', '--project', 'tsconfig.wsh.json']);
run(['node_modules/esbuild/bin/esbuild', '.wsh-build/web-to-md.es5.js',
  '--target=es5', '--platform=neutral', '--format=iife',
  '--outfile=dist/web-to-md.js']);
const text = readFileSync('dist/web-to-md.js', 'utf8');
if (!text.includes('WSH_SELF_TEST_OK') || statSync(resolve('dist/web-to-md.js')).size < 1000) {
  throw new Error('Expected Windows Script Host executable artifact missing');
}
console.log('WSH_BUILD_OK dist/web-to-md.js');
