import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

class R2Client {
  constructor(config) {
    this.config = config;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    
    console.log(chalk.blue(`🔗 Connected to R2 bucket: ${config.bucketName}`));
  }

  /**
   * Upload a single file to R2
   * @param {string} filePath - Local file path
   * @param {string} key - R2 object key
   * @param {object} options - Upload options
   * @returns {Promise<object>} Upload result
   */
  async uploadFile(filePath, key, options = {}) {
    try {
      const fileStream = fs.createReadStream(filePath);
      const stats = fs.statSync(filePath);
      
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.config.bucketName,
          Key: key,
          Body: fileStream,
          ContentType: this.getContentType(filePath),
          CacheControl: 'public, max-age=31536000', // 1 year cache
          ...options.metadata && { Metadata: options.metadata }
        },
      });

      // Track progress if callback provided
      if (options.onProgress) {
        upload.on('httpUploadProgress', (progress) => {
          options.onProgress({
            loaded: progress.loaded || 0,
            total: progress.total || stats.size,
            key: key
          });
        });
      }

      const result = await upload.done();
      
      return {
        success: true,
        key: key,
        size: stats.size,
        etag: result.ETag,
        location: `${this.config.publicDomain || this.getR2Domain()}/${key}`
      };
    } catch (error) {
      console.error(chalk.red(`❌ Failed to upload ${key}:`), error.message);
      return {
        success: false,
        key: key,
        error: error.message
      };
    }
  }

  /**
   * Check if an object exists in R2
   * @param {string} key - R2 object key
   * @returns {Promise<boolean>} Whether object exists
   */
  async objectExists(key) {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.config.bucketName,
        Key: key
      }));
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Upload multiple files with progress tracking
   * @param {Array} fileList - Array of {localPath, key} objects
   * @param {object} options - Upload options
   * @returns {Promise<object>} Upload summary
   */
  async uploadFiles(fileList, options = {}) {
    const results = {
      total: fileList.length,
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      uploaded: []
    };

    console.log(chalk.blue(`🚀 Starting upload of ${fileList.length} files...`));

    for (let i = 0; i < fileList.length; i++) {
      const { localPath, key } = fileList[i];
      
      // Skip if file doesn't exist locally
      if (!fs.existsSync(localPath)) {
        console.log(chalk.yellow(`⚠️  Skipping ${key} - file not found locally`));
        results.skipped++;
        continue;
      }

      // Skip if already exists and not forcing overwrite
      if (!options.force && await this.objectExists(key)) {
        console.log(chalk.gray(`⏭️  Skipping ${key} - already exists`));
        results.skipped++;
        continue;
      }

      const result = await this.uploadFile(localPath, key, {
        onProgress: options.onProgress,
        metadata: options.metadata
      });

      if (result.success) {
        results.success++;
        results.uploaded.push(result);
        console.log(chalk.green(`✅ Uploaded: ${key} (${this.formatBytes(result.size)})`));
      } else {
        results.failed++;
        results.errors.push(result);
        console.log(chalk.red(`❌ Failed: ${key} - ${result.error}`));
      }

      // Progress update
      if (options.onBatchProgress) {
        options.onBatchProgress({
          current: i + 1,
          total: fileList.length,
          success: results.success,
          failed: results.failed,
          skipped: results.skipped
        });
      }
    }

    return results;
  }

  /**
   * Get content type from file extension
   * @param {string} filePath - File path
   * @returns {string} Content type
   */
  getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.avif': 'image/avif'
    };
    return types[ext] || 'application/octet-stream';
  }

  /**
   * Get R2 domain for bucket
   * @returns {string} R2 domain
   */
  getR2Domain() {
    return `https://${this.config.bucketName}.${this.config.accountId}.r2.cloudflarestorage.com`;
  }

  /**
   * Format bytes to human readable string
   * @param {number} bytes - Bytes
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export default R2Client;