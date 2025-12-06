#!/usr/bin/env node

import 'dotenv/config';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import R2Client from './lib/r2-client.js';
import FileUtils from './lib/file-utils.js';
import UploadProgress from './lib/upload-progress.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Command line argument parsing
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  force: args.includes('--force'),
  filter: getArgValue(args, '--filter'),
  changedFiles: getArgValue(args, '--changed-files'),
  type: getArgValue(args, '--type'), // album or artist
  size: getArgValue(args, '--size'), // hi-res, medium, small, avatar
  help: args.includes('--help') || args.includes('-h')
};

function getArgValue(args, argName) {
  const index = args.indexOf(argName);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
}

function printHelp() {
  console.log(chalk.blue(`
🚀 R2 Sync Script - Upload images to Cloudflare R2

Usage: node scripts/sync-to-r2.js [options]

Options:
  --dry-run               List files that would be uploaded without uploading
  --force                 Overwrite existing files in R2
  --filter <pattern>      Filter files by regex pattern
  --changed-files <file>  Only upload files impacted by changes listed in <file>
  --type <type>           Upload only 'album' or 'artist' images
  --size <size>           Upload only specific size: hi-res, medium, small, avatar
  --help, -h              Show this help message

Examples:
  node scripts/sync-to-r2.js                    # Upload all images
  node scripts/sync-to-r2.js --dry-run          # Preview what would be uploaded
  node scripts/sync-to-r2.js --type album       # Upload only album images
  node scripts/sync-to-r2.js --changed-files changes.txt  # Upload only changed content

Environment Variables Required:
  R2_ACCOUNT_ID         Cloudflare account ID
  R2_ACCESS_KEY_ID      R2 API access key
  R2_SECRET_ACCESS_KEY  R2 API secret key
  R2_BUCKET_NAME        R2 bucket name
  R2_PUBLIC_DOMAIN      Public domain (optional)
`));
}

async function validateEnvironment() {
  const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error(chalk.red('❌ Missing required environment variables:'));
    missing.forEach(key => console.error(chalk.red(`   ${key}`)));
    console.error(chalk.yellow('\n💡 Copy .env.example to .env and fill in your values'));
    process.exit(1);
  }

  return {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME,
    publicDomain: process.env.R2_PUBLIC_DOMAIN
  };
}

async function main() {
  console.log(chalk.blue('🌩️  Cloudflare R2 Sync Tool\n'));

  if (options.help) {
    printHelp();
    return;
  }

  // Validate environment
  const config = await validateEnvironment();

  // Find dist directory
  const distPath = path.join(process.cwd(), 'dist');
  console.log(chalk.blue(`📁 Looking for images in: ${distPath}`));

  // Check if dist exists
  const distInfo = FileUtils.getDirectoryInfo(distPath);
  if (!distInfo.exists) {
    console.error(chalk.red('❌ dist directory not found. Run "npm run build" first.'));
    process.exit(1);
  }

  console.log(chalk.green(`✅ Found dist directory with ${distInfo.fileCount} images (${distInfo.formattedSize})`));

  let uploadList = [];

  // Determine filtering strategy
  if (options.changedFiles) {
    console.log(chalk.blue(`\n🔍 Reading changed files from: ${options.changedFiles}`));
    try {
      const content = fs.readFileSync(options.changedFiles, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim() !== '');
      const targets = new Set();
      let hasFullRebuild = false;

      // Check for code changes that imply full rebuild
      // If scripts/ or src/lib/imageProcessor.ts changed, we might want full sync?
      // For now, let's stick to content changes (public/album, public/artist)
      // The user specifically mentioned "newly commited images".

      for (const line of lines) {
        // Match public/album/<slug>/...
        const albumMatch = line.match(/^public\/album\/([^\/]+)/);
        if (albumMatch) {
          targets.add(`album/${albumMatch[1]}`);
        }

        // Match public/artist/<slug>/...
        const artistMatch = line.match(/^public\/artist\/([^\/]+)/);
        if (artistMatch) {
          targets.add(`artist/${artistMatch[1]}`);
        }
      }

      if (targets.size === 0) {
        console.log(chalk.green('✅ No album or artist content changes detected. Skipping upload.'));
        return;
      }

      console.log(chalk.blue(`🎯 Identified ${targets.size} changed targets:`));
      targets.forEach(t => console.log(chalk.gray(`   - ${t}`)));

      uploadList = FileUtils.buildUploadListFromTargets(distPath, targets);

    } catch (e) {
      console.error(chalk.red(`❌ Error reading changed files list: ${e.message}`));
      process.exit(1);
    }
  } else {
    // Build full upload list
    console.log(chalk.blue('\n🔍 Building full upload list...'));
    uploadList = FileUtils.buildUploadList(distPath);
  }

  if (uploadList.length === 0) {
    console.log(chalk.yellow('⚠️  No image files found to upload'));
    return;
  }

  // Apply filters
  if (options.type || options.filter || options.size) {
    console.log(chalk.blue('🔍 Applying filters...'));
    uploadList = FileUtils.filterUploadList(uploadList, {
      type: options.type,
      pattern: options.filter,  // Map --filter to pattern
      size: options.size
    });

    if (uploadList.length === 0) {
      console.log(chalk.yellow('⚠️  No files match the specified filters'));
      return;
    }
  }

  // Verify files exist
  const verification = FileUtils.verifyUploadList(uploadList);
  uploadList = verification.valid;

  if (verification.missing.length > 0) {
    console.log(chalk.yellow(`⚠️  ${verification.missing.length} files are missing locally and will be skipped`));
  }

  // Print summary
  FileUtils.printUploadSummary(uploadList);

  // Dry run mode
  if (options.dryRun) {
    console.log(chalk.yellow('🏃 DRY RUN MODE - No files will be uploaded\n'));
    console.log(chalk.blue('Files that would be uploaded:'));
    uploadList.forEach((item, index) => {
      console.log(chalk.gray(`   ${index + 1}. ${item.key}`));
    });
    console.log(chalk.blue(`\nTotal: ${uploadList.length} files`));
    return;
  }

  // Confirm upload
  if (!options.force) {
    console.log(chalk.yellow('⚠️  This will upload files to R2. Use --dry-run to preview first.'));
    console.log(chalk.gray('   To skip this confirmation, use --force\n'));
  }

  // Initialize R2 client
  console.log(chalk.blue('🔌 Connecting to R2...'));
  const r2Client = new R2Client(config);

  // Initialize progress tracker
  const progress = new UploadProgress({
    showProgress: true,
    showETA: true,
    showSpeed: true
  });

  // Calculate total bytes
  const totalBytes = uploadList.reduce((total, item) => {
    return total + (item.size || 0);
  }, 0);

  // Start upload
  progress.start(uploadList.length, totalBytes);

  try {
    const results = await r2Client.uploadFiles(uploadList, {
      force: options.force,
      onProgress: (fileProgress) => {
        progress.updateFileProgress(fileProgress.key, fileProgress);
      },
      onBatchProgress: (batchProgress) => {
        // Update the progress counter with real-time completion data
        progress.stats.completed = batchProgress.success;
        progress.stats.failed = batchProgress.failed;
        progress.stats.skipped = batchProgress.skipped;

        if (progress.spinner && progress.options.showProgress) {
          progress.spinner.text = progress.getProgressText();
        }
      }
    });

    // Complete progress tracking
    progress.complete(results);

    // Exit with appropriate code
    if (results.failed > 0) {
      console.log(chalk.red(`\n❌ Upload completed with ${results.failed} failures`));
      process.exit(1);
    } else {
      console.log(chalk.green('\n✅ All uploads completed successfully!'));

      if (config.publicDomain) {
        console.log(chalk.blue(`🌐 Images are now available at: ${config.publicDomain}`));
      }
    }

  } catch (error) {
    progress.error(error.message);
    console.error(chalk.red('\n❌ Upload failed:'), error.message);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n⚠️  Upload interrupted by user'));
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('\n❌ Uncaught exception:'), error.message);
  process.exit(1);
});

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red('❌ Script failed:'), error.message);
    process.exit(1);
  });
}

export { main, validateEnvironment };