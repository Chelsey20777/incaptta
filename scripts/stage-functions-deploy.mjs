import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const deploy = resolve(root, 'deploy');
await mkdir(deploy, { recursive: true });
await rm(resolve(deploy, 'dist'), { recursive: true, force: true });
await cp(resolve(root, 'dist'), resolve(deploy, 'dist'), { recursive: true });
console.log('Staged root build into deploy/ for firebase.json functions source.');
