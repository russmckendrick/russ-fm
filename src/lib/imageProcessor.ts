/**
 * Image processing utilities using Sharp for dynamic image resizing
 */

import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import chalk from 'chalk';
import { avatarCropFor, photoSourceFile, type PhotoNotes } from './artistPhotoSource';

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

/** The square an artist's avatar is cut from (artistPhotoSource's avatarCrop), in source px. */
type Crop = { left: number; top: number; size: number };

/**
 * Process a single image into multiple sizes. `avatar`: where to cut the
 * avatar from (round the faces) instead of the middle.
 */
export async function processImage(
  sourceImagePath: string,
  outputPaths: ProcessedImagePaths,
  avatar?: Crop | null,
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

    const image = sharp(sourceImagePath);
    if (sizeName === 'avatar' && avatar) {
      image.extract({ left: avatar.left, top: avatar.top, width: avatar.size, height: avatar.size });
    }
    await image
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

/** An artist's -image.json (scripts/generate-artist-images.js), or null. */
async function readNotes(folder: string, slug: string): Promise<(PhotoNotes & { fanart?: { file?: string } }) | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(folder, `${slug}-image.json`), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * The fanart files an artist's site pages use, besides the hi-res photo: the
 * desktop hero's (`fanart.file`) and a fanart chosen as the artist photo
 * (`source`), both from its -image.json.
 */
async function artistExtraFiles(folder: string, slug: string, files: string[]): Promise<string[]> {
  const notes = await readNotes(folder, slug);
  const wanted = [notes?.fanart?.file, notes?.source].filter((f): f is string => typeof f === 'string' && files.includes(f));
  return [...new Set(wanted)];
}

/**
 * Place every hi-res source image into the output tree next to its processed
 * sizes, so `dist/` carries the complete set an R2 sync expects
 * (hi-res, medium, avatar), plus the one fanart image an artist's desktop
 * hero uses (served as it is, 1280×720). Hard-links when possible (instant,
 * no extra disk), falling back to a copy across filesystems.
 */
export async function linkSourceImages(publicDir: string, outputDir: string): Promise<number> {
  let linked = 0;
  for (const kind of ['album', 'artist']) {
    const sourceDir = path.join(publicDir, kind);
    let entries;
    try {
      entries = await fs.readdir(sourceDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folder = path.join(sourceDir, entry.name);
      const files = await fs.readdir(folder);
      const hiResFile = files.find(file => file.endsWith('-hi-res.jpg'));
      if (!hiResFile) continue;
      const extra = kind === 'artist' ? await artistExtraFiles(folder, entry.name, files) : [];

      for (const file of [hiResFile, ...extra]) {
        const source = path.join(folder, file);
        const target = path.join(outputDir, kind, entry.name, file);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.rm(target, { force: true });
        try {
          await fs.link(source, target);
        } catch {
          await fs.copyFile(source, target);
        }
        linked++;
      }
    }
  }
  return linked;
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

        const hiResPath = path.join(sourceSubDir, hiResFile);

        // Determine output paths - use custom output directory if provided
        const outputPaths = outputDirectory
          ? getProcessedImagePathsForOutput(hiResPath, outputDirectory, entry.name)
          : getProcessedImagePaths(hiResPath);

        // An artist's sizes come from its photo source (a fanart chosen in the
        // scrapper, else the hi-res), with the avatar cut round the faces, both
        // from its -image.json. The notes only steer the crop while they still
        // describe the file: same proportions (an upscaled photo keeps them, so
        // the crop is scaled to its new size).
        let sourceImagePath = hiResPath;
        let crop: Crop | null = null;
        const notes = sourceDirectory.endsWith('artist') ? await readNotes(sourceSubDir, entry.name) : null;
        if (notes) {
          const sourceFile = photoSourceFile(entry.name, notes);
          if (files.includes(sourceFile)) sourceImagePath = path.join(sourceSubDir, sourceFile);
          const { width = 0, height = 0 } = await sharp(sourceImagePath).metadata();
          crop = avatarCropFor(notes, width, height);
        }

        // Check if processing is needed: the source's content and where the avatar is cut.
        const sourceHash = `${await hashFile(sourceImagePath)}${crop ? `:${crop.left},${crop.top},${crop.size}` : ''}`;
        if (await areProcessedImagesUpToDate(sourceHash, outputPaths)) {
          console.log(chalk.gray(`  Skipping (cached): ${entry.name}/${hiResFile}`));
          continue; // Skip if up to date
        }

        console.log(`  Processing: ${entry.name}/${hiResFile}`);
        try {
          await processImage(sourceImagePath, outputPaths, crop);
          await fs.writeFile(getSourceHashPath(outputPaths), `${sourceHash}\n`);
        } catch (error) {
          console.warn(`  ⚠️  Failed to process ${entry.name}/${hiResFile}:`, error instanceof Error ? error.message : error);
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