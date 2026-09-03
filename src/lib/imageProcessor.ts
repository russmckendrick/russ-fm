/**
 * Image processing utilities using Sharp for dynamic image resizing
 */

import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import chalk from 'chalk';

export interface ImageSizes {
  medium: number;
  avatar: number;
}

export const IMAGE_SIZES: ImageSizes = {
  medium: 800,  // For album covers
  avatar: 128,  // For artist avatars
};

export interface ProcessedImagePaths {
  'hi-res': string;
  medium: string;
  avatar: string;
}

/**
 * Path of the sidecar file that records the SHA-1 of the hi-res source the
 * processed outputs were generated from. It lives next to the outputs so it
 * travels with the asset cache.
 */
export function getSourceHashPath(outputPaths: ProcessedImagePaths): string {
  const parsed = path.parse(outputPaths.medium);
  return path.join(parsed.dir, `${parsed.name.replace(/-medium$/, '')}.hi-res.sha1`);
}

export async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha1');
  hash.update(await fs.readFile(filePath));
  return hash.digest('hex');
}

/**
 * Check if processed images exist and were generated from this exact source.
 *
 * Deliberately content-based rather than mtime-based: a fresh git checkout
 * (e.g. in CI) stamps every source with the current time, which made an
 * mtime comparison treat the whole cache as stale on every run.
 */
export async function areProcessedImagesUpToDate(
  sourceHash: string,
  outputPaths: ProcessedImagePaths
): Promise<boolean> {
  for (const [size, outputPath] of Object.entries(outputPaths)) {
    if (size === 'hi-res') continue; // Skip hi-res as it's the source

    try {
      await fs.access(outputPath);
    } catch {
      return false; // Output missing
    }
  }

  try {
    const recorded = (await fs.readFile(getSourceHashPath(outputPaths), 'utf8')).trim();
    return recorded === sourceHash;
  } catch {
    return false; // No record of which source produced the outputs
  }
}

/**
 * Process a single image into multiple sizes
 */
export async function processImage(
  sourceImagePath: string,
  outputPaths: ProcessedImagePaths
): Promise<void> {
  // Ensure output directories exist
  for (const [size, outputPath] of Object.entries(outputPaths)) {
    if (size === 'hi-res') continue; // Skip hi-res as it's the source

    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });
  }

  // Process each size
  const tasks = Object.entries(IMAGE_SIZES).map(async ([sizeName, pixels]) => {
    const outputPath = outputPaths[sizeName as keyof ImageSizes];

    await sharp(sourceImagePath)
      .resize(pixels, pixels, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 85 })
      .toFile(outputPath);
  });

  await Promise.all(tasks);
}

/**
 * Get expected output paths for processed images
 */
export function getProcessedImagePaths(sourceImagePath: string): ProcessedImagePaths {
  const parsedPath = path.parse(sourceImagePath);
  const baseDir = parsedPath.dir;
  const baseName = parsedPath.name.replace('-hi-res', '');

  return {
    'hi-res': sourceImagePath,
    medium: path.join(baseDir, `${baseName}-medium.jpg`),
    avatar: path.join(baseDir, `${baseName}-avatar.jpg`),
  };
}

/**
 * Get expected output paths for processed images with custom output directory
 */
export function getProcessedImagePathsForOutput(
  sourceImagePath: string,
  outputBaseDir: string,
  folderName: string
): ProcessedImagePaths {
  const parsedPath = path.parse(sourceImagePath);
  const baseName = parsedPath.name.replace('-hi-res', '');
  const outputDir = path.join(outputBaseDir, folderName);

  return {
    'hi-res': sourceImagePath,
    medium: path.join(outputDir, `${baseName}-medium.jpg`),
    avatar: path.join(outputDir, `${baseName}-avatar.jpg`),
  };
}

/**
 * Process all images in a directory structure
 */
export async function processAllImages(publicDir: string, outputDir?: string): Promise<void> {
  const sourceAlbumDir = path.join(publicDir, 'album');
  const sourceArtistDir = path.join(publicDir, 'artist');

  console.log('🖼️  Processing album images...');
  await processImagesInDirectory(sourceAlbumDir, outputDir ? path.join(outputDir, 'album') : undefined);

  console.log('🎨 Processing artist images...');
  await processImagesInDirectory(sourceArtistDir, outputDir ? path.join(outputDir, 'artist') : undefined);

  console.log('✅ Image processing complete!');
}

/**
 * Process all hi-res images in a directory
 */
async function processImagesInDirectory(sourceDirectory: string, outputDirectory?: string): Promise<void> {
  try {
    const entries = await fs.readdir(sourceDirectory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sourceSubDir = path.join(sourceDirectory, entry.name);
        const files = await fs.readdir(sourceSubDir);

        // Find hi-res image
        const hiResFile = files.find(file => file.endsWith('-hi-res.jpg'));
        if (!hiResFile) continue;

        const sourceImagePath = path.join(sourceSubDir, hiResFile);

        // Determine output paths - use custom output directory if provided
        const outputPaths = outputDirectory
          ? getProcessedImagePathsForOutput(sourceImagePath, outputDirectory, entry.name)
          : getProcessedImagePaths(sourceImagePath);

        // Check if processing is needed
        const sourceHash = await hashFile(sourceImagePath);
        if (await areProcessedImagesUpToDate(sourceHash, outputPaths)) {
          console.log(chalk.gray(`  Skipping (cached): ${entry.name}/${hiResFile}`));
          continue; // Skip if up to date
        }

        console.log(`  Processing: ${entry.name}/${hiResFile}`);
        try {
          await processImage(sourceImagePath, outputPaths);
          await fs.writeFile(getSourceHashPath(outputPaths), `${sourceHash}\n`);
        } catch (error) {
          console.warn(`  ⚠️  Failed to process ${entry.name}/${hiResFile}:`, error.message);
          // Continue processing other images
        }
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not process directory ${sourceDirectory}:`, error);
  }
}

/**
 * Get the appropriate image path based on size request
 */
export function getImagePath(basePath: string, size: keyof ProcessedImagePaths): string {
  const parsedPath = path.parse(basePath);
  const baseDir = parsedPath.dir;
  const baseName = parsedPath.name.replace(/-(?:hi-res|medium|avatar)$/, '');

  if (size === 'hi-res') {
    return path.join(baseDir, `${baseName}-hi-res.jpg`);
  }

  return path.join(baseDir, `${baseName}-${size}.jpg`);
}