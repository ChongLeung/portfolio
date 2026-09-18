import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8').replace(/^\uFEFF/, ''),
);
let commit = null;
let sourceDirty = true;
try {
  commit = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  sourceDirty =
    execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
      cwd: root,
      encoding: 'utf8',
    }).trim().length !== 0;
} catch {}
if (process.argv.includes('--release') && (!commit || sourceDirty))
  throw Error('A release build requires a clean, committed source tree.');
const record = {
  version: pkg.version,
  commit: sourceDirty ? null : commit,
  builtAt: null,
  sourceDirty,
  status: 'building',
};
mkdirSync(resolve(root, 'public'), { recursive: true });
const publish = (value) => {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  writeFileSync(resolve(root, 'public/build.json'), bytes);
  if (existsSync(resolve(root, 'dist/client')))
    writeFileSync(resolve(root, 'dist/client/build.json'), bytes);
};
publish(record);
const outcome = spawnSync(
  process.execPath,
  [resolve(root, 'node_modules/vinext/dist/cli.js'), 'build'],
  { cwd: root, stdio: 'inherit', env: process.env },
);
if (outcome.error || outcome.status !== 0) {
  publish({ ...record, status: 'failed' });
  if (outcome.error) throw outcome.error;
} else
  publish({
    ...record,
    builtAt: new Date().toISOString(),
    status: 'succeeded',
  });
process.exitCode = outcome.status ?? 1;
