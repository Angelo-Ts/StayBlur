import { readFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('extension');
const manifestPath = resolve(root, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

if (manifest.manifest_version !== 3) throw new Error('extension must use Manifest V3');
if (manifest.background?.service_worker !== 'background/service-worker.js') throw new Error('unexpected service worker path');
if (manifest.background?.type !== 'module') throw new Error('service worker must use module type');
if (manifest.action?.default_popup !== 'popup/popup.html') throw new Error('unexpected popup path');

const requiredPermissions = ['storage', 'tabs', 'scripting'];
for (const permission of requiredPermissions) {
  if (!manifest.permissions?.includes(permission)) {
    throw new Error(`extension must declare ${permission} permission`);
  }
}

const required = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...(manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? []),
];

for (const relative of required) {
  try {
    await access(resolve(root, relative));
  } catch {
    throw new Error(`manifest references missing file: ${relative}`);
  }
}

if (!manifest.host_permissions?.includes('<all_urls>')) {
  throw new Error('extension must declare <all_urls> host permission for the current MVP');
}

if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length === 0) {
  throw new Error('extension must declare at least one content script');
}

for (const script of manifest.content_scripts) {
  if (script.all_frames !== true) throw new Error('content script must run in all frames');
  if (script.run_at !== 'document_idle') throw new Error('content script must run at document_idle');
  if (!script.matches?.includes('<all_urls>')) throw new Error('content script must match <all_urls>');
  if (!Array.isArray(script.js) || script.js.length === 0) throw new Error('content script entry must reference JavaScript files');
}

console.log(`extension manifest OK (${required.length} referenced files checked)`);
