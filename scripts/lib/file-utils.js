import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';

class FileUtils {
  /**
   * Find all image files in a directory
   * @param {string} directory - Directory to search
   * @param {object} options - Search options
   * @returns {Array} Array of file paths
   */
  static findImageFiles(directory, options = {}) {
    const {
      recursive = true,
      extensions = ['jpg', 'jpeg', 'png', 'webp', 'avif'],
      exclude = []
    } = options;

    if (!fs.existsSync(directory)) {
      console.log(chalk.yellow(`⚠️  Directory not found: ${directory}`));
      return [];
    }

    const pattern = recursive
      ? `${directory}/**/*.{${extensions.join(',')}}`
      : `${directory}/*.{${extensions.join(',')}}`;

    try {
      const files = glob.sync(pattern, {
        ignore: exclude,
        nocase: true
      });

      console.log(chalk.blue(`📁 Found ${files.length} image files in ${directory}`));
      return files;
    } catch (error) {
      console.error(chalk.red(`❌ Error finding files in ${directory}:`), error.message);
      return [];
    }
  }

  /**
   * Build file upload list from dist directory
   * @param {string} distPath - Path to dist directory
   * @returns {Array} Array of {localPath, key} objects
   */
  static buildUploadList(distPath) {
    const uploadList = [];

    // Find album images
    const albumPath = path.join(distPath, 'album');
    if (fs.existsSync(albumPath)) {
      const albumFiles = this.findImageFiles(albumPath);
      albumFiles.forEach(filePath => {
        const relativePath = path.relative(distPath, filePath);
        const key = relativePath.replace(/\\/g, '/'); // Normalize path separators
        uploadList.push({
          localPath: filePath,
          key: key,
          type: 'album'
        });
      });
    }

    // Find artist images
    const artistPath = path.join(distPath, 'artist');
    if (fs.existsSync(artistPath)) {
      const artistFiles = this.findImageFiles(artistPath);
      artistFiles.forEach(filePath => {
        const relativePath = path.relative(distPath, filePath);
        const key = relativePath.replace(/\\/g, '/'); // Normalize path separators
        uploadList.push({
          localPath: filePath,
          key: key,
          type: 'artist'
        });
      });
    }

    // Check for generic og-image.png in root
    const rootOgImage = path.join(distPath, 'og-image.png');
    if (fs.existsSync(rootOgImage)) {
      uploadList.push({
        localPath: rootOgImage,
        key: 'og-image.png',
        type: 'other' // or 'site'
      });
    }

    return uploadList;
  }

  /**
   * Build upload list from specific targets (changed folders)
   * @param {string} distPath - Path to dist directory
   * @param {Set<string>} targets - Set of relative paths to target (e.g. 'album/slug')
   * @returns {Array} Array of {localPath, key} objects
   */
  static buildUploadListFromTargets(distPath, targets) {
    const uploadList = [];

    targets.forEach(target => {
      const targetPath = path.join(distPath, target);
      if (fs.existsSync(targetPath)) {
        // Determine type from target string (starts with album/ or artist/)
        const type = target.startsWith('album/') ? 'album' :
          target.startsWith('artist/') ? 'artist' : 'other';

        const files = this.findImageFiles(targetPath);
        files.forEach(filePath => {
          const relativePath = path.relative(distPath, filePath);
          const key = relativePath.replace(/\\/g, '/'); // Normalize path separators
          uploadList.push({
            localPath: filePath,
            key: key,
            type: type
          });
        });
      } else {
        console.log(chalk.yellow(`⚠️  Target directory not found in dist: ${target}`));
      }
    });

    return uploadList;
  }

  /**
   * Filter upload list by type or pattern
   * @param {Array} uploadList - List of files to upload
   * @param {object} filters - Filter options
   * @returns {Array} Filtered list
   */
  static filterUploadList(uploadList, filters = {}) {
    let filtered = [...uploadList];

    // Filter by type (album/artist)
    if (filters.type) {
      filtered = filtered.filter(item => item.type === filters.type);
    }

    // Filter by pattern
    if (filters.pattern) {
      const regex = new RegExp(filters.pattern, 'i');
      filtered = filtered.filter(item => regex.test(item.key));
    }

    // Filter by size (image size: hi-res, medium, small, avatar)
    if (filters.size) {
      filtered = filtered.filter(item => item.key.includes(`-${filters.size}.`));
    }

    console.log(chalk.blue(`🔍 Filtered to ${filtered.length} files`));
    return filtered;
  }

  /**
   * Get directory size and file count
   * @param {string} dirPath - Directory path
   * @returns {object} Size and count info
   */
  static getDirectoryInfo(dirPath) {
    if (!fs.existsSync(dirPath)) {
      return { size: 0, fileCount: 0, exists: false };
    }

    let totalSize = 0;
    let fileCount = 0;

    const files = this.findImageFiles(dirPath);
    files.forEach(filePath => {
      try {
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        fileCount++;
      } catch (error) {
        console.warn(chalk.yellow(`⚠️  Could not stat file: ${filePath}`));
      }
    });

    return {
      size: totalSize,
      fileCount: fileCount,
      exists: true,
      formattedSize: this.formatBytes(totalSize)
    };
  }

  /**
   * Verify upload list - check if all local files exist
   * @param {Array} uploadList - List to verify
   * @returns {object} Verification results
   */
  static verifyUploadList(uploadList) {
    const results = {
      valid: [],
      missing: [],
      total: uploadList.length
    };

    uploadList.forEach(item => {
      if (fs.existsSync(item.localPath)) {
        const stats = fs.statSync(item.localPath);
        results.valid.push({
          ...item,
          size: stats.size
        });
      } else {
        results.missing.push(item);
      }
    });

    if (results.missing.length > 0) {
      console.log(chalk.yellow(`⚠️  ${results.missing.length} files missing locally`));
      results.missing.forEach(item => {
        console.log(chalk.gray(`   Missing: ${item.localPath}`));
      });
    }

    return results;
  }

  /**
   * Remove directory recursively
   * @param {string} dirPath - Directory to remove
   * @returns {boolean} Success
   */
  static removeDirectory(dirPath) {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(chalk.green(`🗑️  Removed directory: ${dirPath}`));
        return true;
      } else {
        console.log(chalk.gray(`📁 Directory doesn't exist: ${dirPath}`));
        return true; // Not an error if it doesn't exist
      }
    } catch (error) {
      console.error(chalk.red(`❌ Failed to remove directory ${dirPath}:`), error.message);
      return false;
    }
  }

  /**
   * Create directory if it doesn't exist
   * @param {string} dirPath - Directory to create
   * @returns {boolean} Success
   */
  static ensureDirectory(dirPath) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(chalk.green(`📁 Created directory: ${dirPath}`));
      }
      return true;
    } catch (error) {
      console.error(chalk.red(`❌ Failed to create directory ${dirPath}:`), error.message);
      return false;
    }
  }

  /**
   * Format bytes to human readable string
   * @param {number} bytes - Bytes
   * @returns {string} Formatted string
   */
  static formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Print upload list summary
   * @param {Array} uploadList - Upload list to summarize
   */
  static printUploadSummary(uploadList) {
    const summary = {
      album: uploadList.filter(item => item.type === 'album').length,
      artist: uploadList.filter(item => item.type === 'artist').length,
      total: uploadList.length
    };

    let totalSize = 0;
    uploadList.forEach(item => {
      if (fs.existsSync(item.localPath)) {
        totalSize += fs.statSync(item.localPath).size;
      }
    });

    console.log(chalk.blue('\n📊 Upload Summary:'));
    console.log(chalk.white(`   Total files: ${summary.total}`));
    console.log(chalk.white(`   Album images: ${summary.album}`));
    console.log(chalk.white(`   Artist images: ${summary.artist}`));
    console.log(chalk.white(`   Total size: ${this.formatBytes(totalSize)}\n`));
  }
}

export default FileUtils;