#!/usr/bin/env node

/**
 * Build-time image processing script
 * Processes all hi-res images into medium, small, and avatar sizes
 * Supports caching to speed up builds
 */

import { processAllImages } from '../src/lib/imageProcessor.ts';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getArgValue(args, argName) {
  const index = args.indexOf(argName);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function main() {
  try {
    const args = process.argv.slice(2);
    // Get output directory from command line argument
    let outputDir = args[0] && !args[0].startsWith('--') ? args[0] : 'dist';

    // Check for cache dir
    const cacheDir = getArgValue(args, '--cache-dir');

    console.log(`🚀 Starting image processing...`);

    const publicDir = path.join(__dirname, '..', 'public');
    const distDir = path.join(__dirname, '..', outputDir);

    if (cacheDir) {
      const absCacheDir = path.isAbsolute(cacheDir) ? cacheDir : path.join(process.cwd(), cacheDir);
      console.log(`📦 Using cache directory: ${absCacheDir}`);

      // 1. Process images INTO the cache directory
      // The updated imageProcessor will skip existing files in this directory
      await processAllImages(publicDir, absCacheDir);

      // 2. Copy processed images from cache to dist
      console.log(`📂 Copying cached images to output: ${outputDir}`);

      // We need to match the structure expected in dist (album/Artist folders)
      // The processor outputs directly to album/artist folders inside the target
      copyDirRecursive(absCacheDir, distDir);

    } else {
      // Direct processing to output (legacy behavior)
      console.log(`📝 Processing directly to output: ${outputDir}`);
      await processAllImages(publicDir, distDir);
    }

    console.log('🎉 Image processing completed successfully!');
  } catch (error) {
    console.error('❌ Error processing images:', error);
    process.exit(1);
  }
}

main();