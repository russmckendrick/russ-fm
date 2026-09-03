#!/usr/bin/env node

/**
 * Symlinks the hooks in scripts/git-hooks/ into .git/hooks/.
 * Runs on `pnpm install` (package.json "prepare"). Skips silently in CI or
 * when the checkout is not a git work tree. Never overwrites a hook it did
 * not create, so locally installed hooks (e.g. graphify's) are left alone.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const sourceDir = path.join(__dirname, 'git-hooks');
const hooksDir = path.join(root, '.git', 'hooks');

if (process.env.CI || !fs.existsSync(hooksDir)) {
  process.exit(0);
}

for (const name of fs.readdirSync(sourceDir)) {
  const source = path.join(sourceDir, name);
  const target = path.join(hooksDir, name);
  const relative = path.relative(hooksDir, source);

  let existing = null;
  try {
    existing = fs.lstatSync(target);
  } catch {
    // not installed yet
  }

  if (existing) {
    const alreadyOurs = existing.isSymbolicLink() && fs.readlinkSync(target) === relative;
    if (alreadyOurs) continue;
    console.warn(`⚠️  .git/hooks/${name} already exists and was not installed by this script; leaving it alone.`);
    console.warn(`   To use the repo hook, remove it and run: pnpm run hooks:install`);
    continue;
  }

  fs.symlinkSync(relative, target);
  console.log(`🔗 Installed git hook: ${name}`);
}
