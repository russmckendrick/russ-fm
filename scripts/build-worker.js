#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Build script optimized for Cloudflare Workers deployment
 * 1. Temporarily moves images out of public/
 * 2. Runs Vite build to dist-worker
 * 3. Restores images to public/
 * 4. Copies JSON files from public/ to dist-worker/
 */

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getDirectorySize(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return { size: 0, fileCount: 0 };
  }

  let totalSize = 0;
  let fileCount = 0;

  function calculateSize(currentPath) {
    const stats = fs.statSync(currentPath);

    if (stats.isDirectory()) {
      const files = fs.readdirSync(currentPath);
      files.forEach(file => {
        calculateSize(path.join(currentPath, file));
      });
    } else {
      totalSize += stats.size;
      fileCount++;
    }
  }

  try {
    calculateSize(dirPath);
  } catch (error) {
    console.warn(chalk.yellow(`⚠️  Could not calculate size for ${dirPath}: ${error.message}`));
  }

  return { size: totalSize, fileCount };
}

function copyJsonFiles(srcDir, destDir, type) {
  if (!fs.existsSync(srcDir)) {
    console.log(chalk.gray(`📁 No ${type} directory found in public/`));
    return 0;
  }

  // Ensure destination directory exists
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  let copiedCount = 0;
  const subdirs = fs.readdirSync(srcDir);

  subdirs.forEach(subdir => {
    const srcSubdir = path.join(srcDir, subdir);
    const destSubdir = path.join(destDir, subdir);

    if (fs.statSync(srcSubdir).isDirectory()) {
      // Create destination subdirectory
      if (!fs.existsSync(destSubdir)) {
        fs.mkdirSync(destSubdir, { recursive: true });
      }

      // Copy only JSON files
      const files = fs.readdirSync(srcSubdir);
      files.forEach(file => {
        if (path.extname(file).toLowerCase() === '.json') {
          const srcFile = path.join(srcSubdir, file);
          const destFile = path.join(destSubdir, file);
          fs.copyFileSync(srcFile, destFile);
          copiedCount++;
        }
      });
    }
  });

  return copiedCount;
}

async function main() {
  console.log(chalk.blue('🏗️  Cloudflare Workers Build Tool\n'));
  console.log(chalk.blue('Building optimized version for Workers deployment...\n'));

  const publicPath = path.join(process.cwd(), 'public');
  const distWorkerPath = path.join(process.cwd(), 'dist-worker');
  const tempImagePath = path.join(process.cwd(), '.temp-images');

  try {
    // Step 1: Temporarily move image directories out of public/
    console.log(chalk.blue('📦 Step 1: Temporarily moving images out of public/...'));

    const albumPath = path.join(publicPath, 'album');
    const artistPath = path.join(publicPath, 'artist');
    const tempAlbumPath = path.join(tempImagePath, 'album');
    const tempArtistPath = path.join(tempImagePath, 'artist');

    // Create temp directory
    if (fs.existsSync(tempImagePath)) {
      fs.rmSync(tempImagePath, { recursive: true, force: true });
    }
    fs.mkdirSync(tempImagePath, { recursive: true });

    // Move images temporarily
    let movedAlbums = false, movedArtists = false;
    if (fs.existsSync(albumPath)) {
      fs.renameSync(albumPath, tempAlbumPath);
      movedAlbums = true;
      console.log(chalk.green('  ✅ Moved album images to temp location'));
    }
    if (fs.existsSync(artistPath)) {
      fs.renameSync(artistPath, tempArtistPath);
      movedArtists = true;
      console.log(chalk.green('  ✅ Moved artist images to temp location'));
    }

    // Step 2: Run Vite build without images
    console.log(chalk.blue('\n🔨 Step 2: Running Vite build (without images)...'));
    execSync('vite build --outDir dist-worker', {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    // Step 3: Restore images to public/
    console.log(chalk.blue('\n📦 Step 3: Restoring images to public/...'));
    if (movedAlbums) {
      fs.renameSync(tempAlbumPath, albumPath);
      console.log(chalk.green('  ✅ Restored album images'));
    }
    if (movedArtists) {
      fs.renameSync(tempArtistPath, artistPath);
      console.log(chalk.green('  ✅ Restored artist images'));
    }

    // Clean up temp directory
    if (fs.existsSync(tempImagePath)) {
      fs.rmSync(tempImagePath, { recursive: true, force: true });
    }

    // Step 4: Copy JSON files to dist-worker
    console.log(chalk.blue('\n📄 Step 4: Copying JSON files to dist-worker...'));

    const albumJsonCount = copyJsonFiles(
      path.join(publicPath, 'album'),
      path.join(distWorkerPath, 'album'),
      'album'
    );

    const artistJsonCount = copyJsonFiles(
      path.join(publicPath, 'artist'),
      path.join(distWorkerPath, 'artist'),
      'artist'
    );

    console.log(chalk.green(`  ✅ Copied ${albumJsonCount} album JSON files`));
    console.log(chalk.green(`  ✅ Copied ${artistJsonCount} artist JSON files`));

    // Step 5: Copy OG image from cache if available
    console.log(chalk.blue('\n📸 Step 5: Copying og-image.png...'));
    const ogImageCachePath = path.join(process.cwd(), 'node_modules/.cache/assets/og/og-image.png');
    const ogImageDestPath = path.join(distWorkerPath, 'og-image.png');

    if (fs.existsSync(ogImageCachePath)) {
      fs.copyFileSync(ogImageCachePath, ogImageDestPath);
      console.log(chalk.green('  ✅ Copied og-image.png from cache'));
    } else {
      console.log(chalk.yellow('  ⚠️  og-image.png not found in cache'));
    }

    // Final size calculation
    const finalSize = getDirectorySize(distWorkerPath);

    console.log(chalk.blue('\n📊 Worker Build Summary:'));
    console.log(chalk.white(`   Total JSON files: ${albumJsonCount + artistJsonCount}`));
    console.log(chalk.white(`   Final size: ${formatBytes(finalSize.size)} (${finalSize.fileCount} files)`));
    console.log(chalk.green(`   ✅ Ready for Cloudflare Workers deployment`));
    console.log(chalk.blue(`   💡 Images will be served from R2 CDN`));

  } catch (error) {
    console.error(chalk.red('\n❌ Worker build failed:'), error.message);

    // Emergency cleanup - restore images if they're still in temp
    try {
      const tempAlbumPath = path.join(tempImagePath, 'album');
      const tempArtistPath = path.join(tempImagePath, 'artist');
      const albumPath = path.join(publicPath, 'album');
      const artistPath = path.join(publicPath, 'artist');

      if (fs.existsSync(tempAlbumPath) && !fs.existsSync(albumPath)) {
        fs.renameSync(tempAlbumPath, albumPath);
        console.log(chalk.yellow('🔄 Emergency: Restored album images'));
      }
      if (fs.existsSync(tempArtistPath) && !fs.existsSync(artistPath)) {
        fs.renameSync(tempArtistPath, artistPath);
        console.log(chalk.yellow('🔄 Emergency: Restored artist images'));
      }

      if (fs.existsSync(tempImagePath)) {
        fs.rmSync(tempImagePath, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      console.error(chalk.red('❌ Emergency cleanup failed:'), cleanupError.message);
    }

    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n⚠️  Build interrupted by user'));
  process.exit(1);
});

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red('❌ Script failed:'), error.message);
    process.exit(1);
  });
}

export { main };