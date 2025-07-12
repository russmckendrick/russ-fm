#!/usr/bin/env node

/**
 * Build-time image processing script
 * Processes all hi-res images into medium, small, and avatar sizes
 */

import { processAllImages } from '../src/lib/imageProcessor.ts';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  try {
    console.log('🚀 Starting image processing for build...');
    
    const publicDir = path.join(__dirname, '..', 'public');
    const distDir = path.join(__dirname, '..', 'dist');
    
    // Process images and output to dist directory
    await processAllImages(publicDir, distDir);
    
    console.log('🎉 Image processing completed successfully!');
  } catch (error) {
    console.error('❌ Error processing images:', error);
    process.exit(1);
  }
}

main();