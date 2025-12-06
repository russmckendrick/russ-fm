import ora from 'ora';
import chalk from 'chalk';

class UploadProgress {
  constructor(options = {}) {
    this.options = {
      showProgress: true,
      showETA: true,
      showSpeed: true,
      updateInterval: 100,
      ...options
    };
    
    this.startTime = null;
    this.spinner = null;
    this.stats = {
      total: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      totalBytes: 0,
      uploadedBytes: 0,
      currentFile: null
    };
    
    this.fileProgress = new Map(); // Track individual file progress
  }

  /**
   * Initialize progress tracking
   * @param {number} totalFiles - Total number of files
   * @param {number} totalBytes - Total bytes to upload
   */
  start(totalFiles, totalBytes = 0) {
    this.startTime = Date.now();
    this.stats.total = totalFiles;
    this.stats.totalBytes = totalBytes;
    
    if (this.options.showProgress) {
      this.spinner = ora({
        text: this.getProgressText(),
        color: 'blue'
      }).start();
    }
    
    console.log(chalk.blue(`🚀 Starting upload of ${totalFiles} files...`));
  }

  /**
   * Update progress for a specific file
   * @param {string} fileKey - File key/name
   * @param {object} progress - Progress info {loaded, total}
   */
  updateFileProgress(fileKey, progress) {
    this.fileProgress.set(fileKey, progress);
    this.stats.currentFile = fileKey;
    
    // Calculate total uploaded bytes
    this.stats.uploadedBytes = 0;
    for (const [key, fileProgress] of this.fileProgress) {
      this.stats.uploadedBytes += fileProgress.loaded || 0;
    }
    
    if (this.spinner && this.options.showProgress) {
      this.spinner.text = this.getProgressText();
    }
  }

  /**
   * Mark a file as completed
   * @param {string} fileKey - File key/name
   * @param {boolean} success - Whether upload succeeded
   */
  fileCompleted(fileKey, success = true) {
    if (success) {
      this.stats.completed++;
    } else {
      this.stats.failed++;
    }
    
    // Remove from active progress tracking
    this.fileProgress.delete(fileKey);
    
    if (this.spinner && this.options.showProgress) {
      this.spinner.text = this.getProgressText();
    }
  }

  /**
   * Mark a file as skipped
   * @param {string} fileKey - File key/name
   */
  fileSkipped(fileKey) {
    this.stats.skipped++;
    
    if (this.spinner && this.options.showProgress) {
      this.spinner.text = this.getProgressText();
    }
  }

  /**
   * Get current progress text
   * @returns {string} Progress text
   */
  getProgressText() {
    const { completed, failed, skipped, total, currentFile } = this.stats;
    const processed = completed + failed + skipped;
    const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
    
    let text = `[${processed}/${total}] ${percentage}% `;
    
    // Add current file info
    if (currentFile) {
      const fileName = currentFile.split('/').pop();
      text += `• ${fileName}`;
    }
    
    // Add speed and ETA if requested
    if (this.options.showSpeed || this.options.showETA) {
      const elapsed = Date.now() - this.startTime;
      const speed = this.stats.uploadedBytes / (elapsed / 1000); // bytes per second
      
      if (this.options.showSpeed && speed > 0) {
        text += ` • ${this.formatSpeed(speed)}`;
      }
      
      if (this.options.showETA && processed > 0) {
        const remaining = total - processed;
        const avgTimePerFile = elapsed / processed;
        const eta = (remaining * avgTimePerFile) / 1000; // seconds
        text += ` • ETA: ${this.formatDuration(eta)}`;
      }
    }
    
    return text;
  }

  /**
   * Complete the progress tracking
   * @param {object} finalStats - Final statistics
   */
  complete(finalStats = {}) {
    const duration = Date.now() - this.startTime;
    
    if (this.spinner) {
      if (finalStats.failed > 0) {
        this.spinner.fail(chalk.red(`Upload completed with ${finalStats.failed} failures`));
      } else {
        this.spinner.succeed(chalk.green(`Upload completed successfully!`));
      }
    }
    
    // Print final summary
    this.printSummary(duration, finalStats);
  }

  /**
   * Stop progress tracking with error
   * @param {string} message - Error message
   */
  error(message) {
    if (this.spinner) {
      this.spinner.fail(chalk.red(`Upload failed: ${message}`));
    } else {
      console.error(chalk.red(`❌ Upload failed: ${message}`));
    }
  }

  /**
   * Print detailed summary
   * @param {number} duration - Total duration in ms
   * @param {object} stats - Final statistics
   */
  printSummary(duration, stats) {
    console.log(chalk.blue('\n📊 Upload Summary:'));
    console.log(chalk.white(`   Duration: ${this.formatDuration(duration / 1000)}`));
    console.log(chalk.green(`   ✅ Successful: ${stats.success || this.stats.completed}`));
    console.log(chalk.gray(`   ⏭️  Skipped: ${stats.skipped || this.stats.skipped}`));
    
    if (stats.failed > 0) {
      console.log(chalk.red(`   ❌ Failed: ${stats.failed}`));
    }
    
    if (stats.totalBytes || this.stats.totalBytes > 0) {
      const totalBytes = stats.totalBytes || this.stats.totalBytes;
      const avgSpeed = totalBytes / (duration / 1000);
      console.log(chalk.white(`   📦 Total size: ${this.formatBytes(totalBytes)}`));
      console.log(chalk.white(`   🚀 Average speed: ${this.formatSpeed(avgSpeed)}`));
    }
    
    console.log(''); // Empty line
  }

  /**
   * Format bytes to human readable string
   * @param {number} bytes - Bytes
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Format speed to human readable string
   * @param {number} bytesPerSecond - Bytes per second
   * @returns {string} Formatted speed
   */
  formatSpeed(bytesPerSecond) {
    return `${this.formatBytes(bytesPerSecond)}/s`;
  }

  /**
   * Format duration to human readable string
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration
   */
  formatDuration(seconds) {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * Create a simple progress bar
   * @param {number} percentage - Progress percentage (0-100)
   * @param {number} width - Bar width in characters
   * @returns {string} Progress bar
   */
  createProgressBar(percentage, width = 20) {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${' '.repeat(empty)}]`;
  }
}

export default UploadProgress;