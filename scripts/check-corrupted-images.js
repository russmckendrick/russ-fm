#!/usr/bin/env node

/**
 * Report tool to identify corrupted or invalid image files
 * Checks all hi-res images and reports which ones can't be processed by Sharp
 */

import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkImageFile(imagePath) {
  try {
    // Try to get metadata from the image
    const metadata = await sharp(imagePath).metadata();
    return { valid: true, metadata };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

async function checkDirectoryImages(directory, type) {
  const results = [];
  
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDir = path.join(directory, entry.name);
        const files = await fs.readdir(subDir);
        
        // Find hi-res image
        const hiResFile = files.find(file => file.endsWith('-hi-res.jpg'));
        if (!hiResFile) continue;
        
        const imagePath = path.join(subDir, hiResFile);
        const result = await checkImageFile(imagePath);
        
        results.push({
          type,
          folder: entry.name,
          file: hiResFile,
          path: imagePath,
          ...result
        });
      }
    }
  } catch (error) {
    console.error(`Error checking directory ${directory}:`, error.message);
  }
  
  return results;
}

async function checkFileType(filePath) {
  try {
    // Read first few bytes to determine actual file type
    const buffer = await fs.readFile(filePath, { length: 512 });
    const start = buffer.toString('utf8', 0, 100);
    
    if (start.includes('<!DOCTYPE html') || start.includes('<html')) {
      return 'HTML document';
    } else if (start.includes('<?xml')) {
      return 'XML document';
    } else if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      return 'JPEG image';
    } else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return 'PNG image';
    } else {
      return `Unknown (starts with: ${start.substring(0, 50)}...)`;
    }
  } catch (error) {
    return `Error reading file: ${error.message}`;
  }
}

async function main() {
  console.log('🔍 Checking for corrupted or invalid image files...\n');
  
  const publicDir = path.join(__dirname, '..', 'public');
  const albumDir = path.join(publicDir, 'album');
  const artistDir = path.join(publicDir, 'artist');
  
  console.log('📁 Checking album images...');
  const albumResults = await checkDirectoryImages(albumDir, 'album');
  
  console.log('🎨 Checking artist images...');
  const artistResults = await checkDirectoryImages(artistDir, 'artist');
  
  const allResults = [...albumResults, ...artistResults];
  const corruptedFiles = allResults.filter(result => !result.valid);
  const validFiles = allResults.filter(result => result.valid);
  
  console.log('\n📊 SUMMARY');
  console.log('=' .repeat(50));
  console.log(`Total files checked: ${allResults.length}`);
  console.log(`Valid images: ${validFiles.length}`);
  console.log(`Corrupted/Invalid files: ${corruptedFiles.length}`);
  
  if (corruptedFiles.length > 0) {
    console.log('\n❌ CORRUPTED/INVALID FILES');
    console.log('=' .repeat(50));
    
    for (const file of corruptedFiles) {
      console.log(`\n📂 ${file.type}/${file.folder}`);
      console.log(`   File: ${file.file}`);
      console.log(`   Error: ${file.error}`);
      
      // Check actual file type
      const actualType = await checkFileType(file.path);
      console.log(`   Actual file type: ${actualType}`);
      
      // Show file size
      try {
        const stats = await fs.stat(file.path);
        console.log(`   File size: ${(stats.size / 1024).toFixed(2)} KB`);
      } catch (error) {
        console.log(`   File size: Error getting size`);
      }
    }
    
    console.log('\n🔧 RECOMMENDATIONS');
    console.log('=' .repeat(50));
    console.log('1. HTML/XML files likely indicate download failures');
    console.log('2. Re-run the scraper for these specific items to get proper images');
    console.log('3. Or manually replace with valid image files');
    console.log('\nTo re-download specific items, use:');
    console.log('python main.py release <release-id> --save');
    console.log('python main.py artist "<artist-name>" --save');
  } else {
    console.log('\n✅ All image files are valid!');
  }
  
  // Save detailed report to file
  const reportPath = path.join(__dirname, '..', 'corrupted-images-report.json');
  await fs.writeFile(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total: allResults.length,
      valid: validFiles.length,
      corrupted: corruptedFiles.length
    },
    corruptedFiles: corruptedFiles
  }, null, 2));
  
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
}

main().catch(error => {
  console.error('❌ Error running image check:', error);
  process.exit(1);
});