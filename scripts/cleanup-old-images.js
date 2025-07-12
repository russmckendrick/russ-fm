#!/usr/bin/env node

/**
 * Cleanup script to remove ALL medium and small images from public folder
 * Only keeps hi-res source images and JSON files
 * Images are now generated on-demand (dev) or at build time (production)
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const FORCE = process.argv.includes('--force');

// Statistics
let stats = {
  scanned: 0,
  mediumFound: 0,
  smallFound: 0,
  avatarFound: 0,
  deleted: 0,
  spaceSaved: 0,
  errors: 0
};

/**
 * Check if a file should be removed
 */
function shouldRemoveFile(filename) {
  // Remove ALL medium, small, and avatar images - they're generated on-demand/build-time now
  return filename.match(/-(?:medium|small|avatar)\.jpg$/) || false;
}

/**
 * Get the type of image file
 */
function getImageType(filename) {
  if (filename.includes('-medium.jpg')) return 'medium';
  if (filename.includes('-small.jpg')) return 'small'; 
  if (filename.includes('-avatar.jpg')) return 'avatar';
  return null;
}

/**
 * Get human readable file size
 */
function getFileSize(bytes) {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Process a single directory
 */
async function processDirectory(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDirPath = path.join(dirPath, entry.name);
        const files = await fs.readdir(subDirPath);
        
        if (VERBOSE) {
          console.log(`📁 Processing: ${entry.name}/`);
        }
        
        for (const filename of files) {
          const filePath = path.join(subDirPath, filename);
          stats.scanned++;
          
          if (shouldRemoveFile(filename)) {
            try {
              const fileStat = await fs.stat(filePath);
              const imageType = getImageType(filename);
              
              // Update stats
              if (imageType === 'medium') stats.mediumFound++;
              else if (imageType === 'small') stats.smallFound++;
              else if (imageType === 'avatar') stats.avatarFound++;
              
              if (DRY_RUN) {
                console.log(`  🗑️  [DRY RUN] Would delete: ${filename} (${getFileSize(fileStat.size)})`);
                stats.spaceSaved += fileStat.size;
              } else {
                await fs.unlink(filePath);
                console.log(`  🗑️  Deleted: ${filename} (${getFileSize(fileStat.size)})`);
                stats.deleted++;
                stats.spaceSaved += fileStat.size;
              }
            } catch (error) {
              console.error(`  ❌ Error processing ${filename}: ${error.message}`);
              stats.errors++;
            }
          } else if (VERBOSE && (filename.includes('-hi-res.jpg') || filename.endsWith('.json'))) {
            console.log(`  ✅ Keeping: ${filename}`);
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dirPath}: ${error.message}`);
    stats.errors++;
  }
}

/**
 * Main cleanup function
 */
async function cleanupOldImages() {
  const publicDir = path.join(__dirname, '..', 'public');
  const albumDir = path.join(publicDir, 'album');
  const artistDir = path.join(publicDir, 'artist');
  
  console.log('🧹 Starting cleanup of old image files...');
  
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be deleted');
  }
  
  if (!FORCE) {
    console.log('⚠️  This will remove ALL medium, small, and avatar images from the public folder');
    console.log('🔧 Images are now generated on-demand (dev) or at build time (production)');
    console.log('💡 Use --dry-run to see what would be deleted');
    console.log('💡 Use --force to skip this warning');
    
    if (!DRY_RUN) {
      console.log('\n⏳ Continuing in 5 seconds... (Ctrl+C to cancel)');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.log('\n🖼️  Processing album images...');
  await processDirectory(albumDir);
  
  console.log('\n🎨 Processing artist images...');
  await processDirectory(artistDir);
  
  // Print summary
  console.log('\n📊 Cleanup Summary:');
  console.log(`   Files scanned: ${stats.scanned.toLocaleString()}`);
  console.log(`   Medium images found: ${stats.mediumFound.toLocaleString()}`);
  console.log(`   Small images found: ${stats.smallFound.toLocaleString()}`);
  console.log(`   Avatar images found: ${stats.avatarFound.toLocaleString()}`);
  
  const totalFound = stats.mediumFound + stats.smallFound + stats.avatarFound;
  
  if (DRY_RUN) {
    console.log(`   Files that would be deleted: ${totalFound.toLocaleString()}`);
    console.log(`   Space that would be saved: ${getFileSize(stats.spaceSaved)}`);
  } else {
    console.log(`   Files deleted: ${stats.deleted.toLocaleString()}`);
    console.log(`   Space saved: ${getFileSize(stats.spaceSaved)}`);
  }
  
  if (stats.errors > 0) {
    console.log(`   Errors: ${stats.errors}`);
  }
  
  console.log('\n✅ Cleanup completed!');
  
  if (DRY_RUN) {
    console.log('\n💡 Run without --dry-run to actually delete the files');
  }
}

// Show help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🧹 Image Cleanup Script

This script removes ALL medium, small, and avatar images from the public folder.
These images are now generated on-demand (dev mode) or at build time (production).
Only keeps hi-res source images and JSON files.

Usage:
  npm run cleanup-images [options]

Options:
  --dry-run     Show what would be deleted without actually deleting
  --verbose     Show detailed output
  --force       Skip confirmation prompt
  --help, -h    Show this help

Examples:
  npm run cleanup-images -- --dry-run          # See what would be deleted
  npm run cleanup-images -- --verbose          # Show detailed output
  npm run cleanup-images -- --force            # Skip confirmation
  npm run cleanup-images -- --dry-run --verbose # Detailed dry run

What gets removed:
  - ALL medium images (-medium.jpg)
  - ALL small images (-small.jpg) 
  - ALL avatar images (-avatar.jpg)

What gets kept:
  - Hi-res source images (-hi-res.jpg)
  - JSON data files (.json)
`);
  process.exit(0);
}

// Run the cleanup
cleanupOldImages().catch(error => {
  console.error('❌ Cleanup failed:', error);
  process.exit(1);
});