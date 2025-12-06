/**
 * Simple R2 client for Node.js build scripts
 * Uses AWS SDK v3 for S3-compatible operations with Cloudflare R2
 */

import { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import path from 'path';
import mime from 'mime-types';

export class R2Client {
  constructor(config) {
    this.config = config;
    this.bucketName = config.bucketName;
    this.publicDomain = config.publicDomain;
    
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: false,
      tls: true,
    });
  }
  
  async testConnection() {
    try {
      console.log(`Testing connection to: https://${this.config.accountId}.r2.cloudflarestorage.com`);
      console.log(`Bucket: ${this.bucketName}`);
      console.log(`Access Key ID: ${this.config.accessKeyId.substring(0, 8)}...`);
      
      await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucketName,
        MaxKeys: 1
      }));
      return true;
    } catch (error) {
      console.error('R2 connection test failed:', error.message);
      console.error('Error code:', error.name);
      console.error('HTTP status:', error.$metadata?.httpStatusCode);
      return false;
    }
  }
  
  async fileExists(key) {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.bucketName,
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
  
  async uploadFile(localPath, r2Key, contentType = null) {
    try {
      const fileContent = await fs.readFile(localPath);
      
      if (!contentType) {
        contentType = mime.lookup(localPath) || 'application/octet-stream';
      }
      
      const cacheControl = this.getCacheControl(contentType, r2Key);
      
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucketName,
        Key: r2Key,
        Body: fileContent,
        ContentType: contentType,
        CacheControl: cacheControl,
      }));
      
      return true;
    } catch (error) {
      console.error(`Failed to upload ${r2Key}:`, error.message);
      return false;
    }
  }
  
  async uploadJSON(data, r2Key) {
    try {
      const jsonContent = JSON.stringify(data, null, 2);
      
      const cacheControl = this.getCacheControl('application/json', r2Key);
      
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucketName,
        Key: r2Key,
        Body: jsonContent,
        ContentType: 'application/json',
        CacheControl: cacheControl,
      }));
      
      return true;
    } catch (error) {
      console.error(`Failed to upload JSON ${r2Key}:`, error.message);
      return false;
    }
  }
  
  getCacheControl(contentType, key = '') {
    // Collection.json gets shorter cache time
    if (key === 'collection.json') {
      return 'public, max-age=1800'; // 30 minutes
    }
    
    if (contentType === 'application/json') {
      return 'public, max-age=3600'; // 1 hour for other JSON
    }
    
    if (contentType.startsWith('image/')) {
      return 'public, max-age=86400'; // 24 hours for images
    }
    
    return 'public, max-age=3600'; // 1 hour default
  }
  
  getPublicUrl(key) {
    return `${this.publicDomain}/${key}`;
  }
}

export function createR2Client(config) {
  return new R2Client(config);
}