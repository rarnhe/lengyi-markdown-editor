// Windows-only suite wrapper. Writes report and GitHub job summary.
import { spawnSync } from 'node:child_process';
import { writeFileSync, appendFileSync } from 'node:fs';
const result = spawnSync(process.execPath, ['--test','tests/test_wsh.mjs'], { encoding:'utf8', timeout:180000 });
const output = (result.stdout || '') + (result.stderr || '');
process.stdout.write(output);
const ok = result.status === 0;
const report = [
  '# Windows Script Host Build & Execution Report', '',
  '- Generated (UTC): ' + new Date().toISOString(),
  '- Commit: ' + (process.env.GITHUB_SHA || 'local working tree'),
  '- Result: **' + (ok ? 'PASS' : 'FAIL') + '**',
  '- Toolchain: tsc --target ES5 --module none => esbuild --target=es5 => dist/web-to-md.js',
  '- Runtime: cscript.exe; Node.js used for build/test only.', '',
  '## Command', '', 'node --test tests/test_wsh.mjs', '',
  '## Output', '', '~~~text', output.slice(-24000), '~~~', ''
].join('\n');
writeFileSync('test_report_wsh.md', report, 'utf8');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
if (!ok) process.exitCode = result.status || 1;
