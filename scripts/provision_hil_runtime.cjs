#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { TARGETS, runtimeEnvironment, run, hashFile, verifyRuntimeBundle } = require('../src/security/hilRuntime.cjs');
const root = path.resolve(__dirname, '../toolchains/hil-runtime');
const PYTHON_URL = 'https://www.python.org/ftp/python/3.13.7/python-3.13.7-embed-amd64.zip';
const PYTHON_SHA = 'f6cca216a359be84797cabb54149ce5e062afb16cc7567eb7fc51cacb2d86b65';
const PIP_URL = 'https://files.pythonhosted.org/packages/b7/3f/945ef7ab14dc4f9d7f40288d2df998d1837ee0888ec3659c813487572faa/pip-25.2-py3-none-any.whl';
const PIP_SHA = '6d67a2b4e7f14d8b31b8b52648866fa717f45a1eb70e83002f4331d07e953717';
async function download(url, file, sha) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (crypto.createHash('sha256').update(data).digest('hex') !== sha) throw new Error(`Download hash mismatch: ${url}`);
  fs.writeFileSync(file, data);
}
function extract(zip, destination) {
  fs.mkdirSync(destination, { recursive: true });
  execFileSync('tar', ['-xf', zip, '-C', destination], { shell: false, stdio: 'inherit' });
}
function inventory(dir, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['__pycache__', '.cache'].includes(entry.name) || entry.name === 'bundle-manifest.json') continue;
    const relative = `${prefix}${entry.name}`;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...inventory(absolute, `${relative}/`));
    else files.push({ path: relative, sha256: hashFile(absolute), required: /(?:python.exe|sitecustomize.py|platformio\/__init__.py|platform.json|package.json|avr-size.exe|arm-none-eabi-size.exe|xtensa-esp32-elf-size.exe|avrdude.exe|openocd.exe|esptool.py|stm32f[14]xx_hal.h|Arduino.h)$/.test(relative) });
  }
  return files;
}
async function main() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('The portable HIL runtime currently targets Windows x64.');
  fs.mkdirSync(root, { recursive: true });
  const runtime = { root, python: path.join(root, 'python/python.exe'), core: path.join(root, 'core') };
  if (!fs.existsSync(runtime.python)) {
    const zip = path.join(root, 'python.zip');
    await download(PYTHON_URL, zip, PYTHON_SHA); extract(zip, path.dirname(runtime.python)); fs.unlinkSync(zip);
  }
  fs.writeFileSync(path.join(root, 'python/python313._pth'), 'python313.zip\n.\nLib/site-packages\nimport site\n');
  const site = path.join(root, 'python/Lib/site-packages'); fs.mkdirSync(site, { recursive: true });
  if (!fs.existsSync(path.join(site, 'pip/__init__.py'))) {
    const wheel = path.join(root, 'pip.zip'); await download(PIP_URL, wheel, PIP_SHA); extract(wheel, site); fs.unlinkSync(wheel);
  }
  const env = runtimeEnvironment(runtime, runtime.core, false);
  let result = await run(runtime.python, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-warn-script-location', '-r', path.join(__dirname, 'hil-runtime-requirements.txt')], { env, onLog: line => process.stdout.write(line) });
  if (!result.success) throw new Error(result.error);
  // Explicit offline guard: runtime build processes cannot fetch missing packages.
  fs.writeFileSync(path.join(site, 'sitecustomize.py'), `import os, sys, socket\n# Embedded Python omits script directories; vendor tools import sibling modules.\nif sys.argv and sys.argv[0] and not sys.argv[0].startswith('-'):\n    sys.path.insert(0, os.path.dirname(os.path.abspath(sys.argv[0])))\nif os.environ.get('ADIA_HIL_OFFLINE') == '1':\n    _connect = socket.socket.connect\n    def _offline_connect(self, address):\n        if self.family in (socket.AF_INET, socket.AF_INET6):\n            raise OSError('ADIA HIL offline runtime: network access disabled')\n        return _connect(self, address)\n    socket.socket.connect = _offline_connect\n`);
  const platforms = [...new Set(Object.values(TARGETS).map(target => target.platform))];
  for (const platform of platforms) {
    result = await run(runtime.python, ['-m', 'platformio', 'pkg', 'install', '--global', '--platform', platform], { env, onLog: line => process.stdout.write(line) });
    if (!result.success) throw new Error(result.error);
  }
  // Prepare each board/framework's dependency closure by building a tiny REAL vendor project.
  const projects = path.resolve(__dirname, '../.tmp/hil-runtime-provision');
  for (const [id, target] of Object.entries(TARGETS)) {
    const project = path.join(projects, id); fs.mkdirSync(path.join(project, 'src'), { recursive: true });
    fs.writeFileSync(path.join(project, 'platformio.ini'), `[env:${target.env}]\nplatform = ${target.platform}\nboard = ${target.board}\nframework = ${target.framework}\n`);
    const arduino = target.framework === 'arduino';
    fs.writeFileSync(path.join(project, 'src', arduino ? 'main.cpp' : 'main.c'), arduino ? '#include <Arduino.h>\nvoid setup(){pinMode(2,OUTPUT);}\nvoid loop(){digitalWrite(2,HIGH);delay(1);}\n' : `#include <${id.startsWith('stm32f1') ? 'stm32f1xx_hal.h' : 'stm32f4xx_hal.h'}>\nint main(void){HAL_Init();for(;;){}}\n`);
    result = await run(runtime.python, ['-m', 'platformio', 'run', '-d', project], { env, onLog: line => process.stdout.write(line) });
    if (!result.success) throw new Error(`${id}: ${result.error}`);
  }
  const manifest = { schemaVersion: 1, platformioVersion: '6.1.18', pythonVersion: '3.13.7', targets: platforms, files: inventory(root) };
  fs.writeFileSync(path.join(root, 'bundle-manifest.json'), JSON.stringify(manifest, null, 2));
  verifyRuntimeBundle(root, { deep: true });
  console.log(`Verified production HIL runtime: ${manifest.files.length} bundled files.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
