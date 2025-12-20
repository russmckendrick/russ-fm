# Cloudflare R2 Platform Architecture

## Platform Overview

This document outlines the platform architecture and infrastructure considerations for integrating Cloudflare R2 object storage with the russ.fm music collection system. The key architectural principle is that image processing happens during the npm build phase, not in the Python backend.

## Infrastructure Components

### Cloudflare R2
- **Service**: Object storage compatible with S3 API
- **Bucket**: `russ-fm-assets`
- **Region**: Auto (Cloudflare's global network)
- **Access**: Public read via custom domain

### Custom Domain Setup
- **Domain**: https://assets.russ.fm
- **Type**: R2 public bucket domain
- **SSL**: Automatic via Cloudflare
- **Caching**: Cloudflare CDN edge caching

## Architecture Diagram

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Python Backend │────▶│   Local /public  │────▶│  npm run build  │
│   (Scrapper)    │     │  (Raw Images)    │     │ (Process/Resize)│
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                           │
                                                           ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Cloudflare    │◀────│   R2 Sync Script │◀────│    /dist        │
│   CDN Edge      │     │ (Post-build)     │     │ (Processed)     │
└────────┬────────┘     └──────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│  Browser/Users  │────▶│  Web Server      │
│   (Global)      │     │ (JSON + React)   │
└─────────────────┘     └──────────────────┘
```

## Build Pipeline Architecture

### Development Pipeline (No R2)
```yaml
Local Development:
  1. Python scrapes data → /public/
  2. npm run dev → Vite serves from /public/
  3. Hot reload for React changes
  4. Images served locally (existing workflow unchanged)
  5. No R2 integration needed for development
```

### Production Pipeline (R2 Integration Complete)
```yaml
Production Build:
  1. Python scrapes data → /public/
  2. npm run build → Processes images → /dist/
  3. npm run build:sync → Upload images to R2
  4. Deploy React app + JSON (images excluded)
  5. Images served from CDN (https://assets.russ.fm)
  
Status: ✅ All components updated for automatic R2 switching
```

## Security Configuration

### R2 Bucket Policy
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::russ-fm-assets/*"
    }
  ]
}
```

### API Credentials
- **Scope**: Limited to `russ-fm-assets` bucket
- **Permissions**: Read, Write, List
- **Storage**: Environment variables (.env file)
- **Access**: Build server only (not in browser)

### CORS Configuration
```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://russ.fm", "http://localhost:5173"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

## Performance Optimization

### CDN Configuration
- **Cache TTL**: 31536000 seconds (1 year) for images
- **Compression**: Automatic for supported formats
- **Image Formats**: JPEG with optimized quality
- **HTTP/3**: Enabled for faster delivery

### Build Optimization
- **Parallel Processing**: Multiple images processed concurrently
- **Smart Caching**: Skip unchanged images
- **Incremental Uploads**: Only sync modified files
- **Progress Tracking**: Real-time upload status

### Frontend Performance ✅ IMPLEMENTED
- **Environment Switching**: Automatic dev/prod URL switching implemented
- **Centralized Error Handling**: Consistent fallback logic across all components  
- **Type Safety**: Full TypeScript support for image operations
- **Component Updates**: All 11 React components migrated to R2-aware utilities
- **Development Preservation**: Local workflow unchanged (npm run dev uses local images)
- **Production Optimization**: Automatic R2 CDN loading in production builds

## Cost Analysis

### R2 Pricing Model
- **Storage**: $0.015 per GB/month
- **Class A Operations**: $4.50 per million (writes)
- **Class B Operations**: $0.36 per million (reads)
- **Egress**: Free (via Cloudflare network)

### Estimated Costs
Based on 10,000 albums with 3 images each:
- **Storage**: ~30GB = $0.45/month
- **Monthly Builds**: ~90,000 operations = $0.40/month
- **Monthly Reads**: ~1M requests = $0.36/month
- **Total**: ~$1.21/month

### Cost Optimization
- Build-time deduplication
- Incremental sync reduces operations
- CDN caching reduces reads
- No egress fees with Cloudflare

## Deployment Architecture

### Environment Configuration
```yaml
Production:
  - Domain: assets.russ.fm
  - Bucket: russ-fm-assets
  - Cache: Aggressive (1 year)
  - Build: GitHub Actions / CI

Staging:
  - Domain: staging-assets.russ.fm
  - Bucket: russ-fm-assets-staging
  - Cache: Moderate (1 day)
  - Build: Manual trigger

Development:
  - Local: Vite dev server
  - Images: Served from /public/
  - R2: Not used (keeps existing workflow)
```

### CI/CD Integration
```yaml
Deploy Pipeline:
  1. Trigger: Push to main branch
  2. Checkout code
  3. Install dependencies
  4. Run build process
  5. Sync images to R2
  6. Deploy app bundle (no images)
  7. Verify deployment
  8. Purge CDN cache (if needed)
```

### GitHub Actions Example
```yaml
- name: Build and Sync
  env:
    R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
    R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
    R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
  run: |
    npm ci
    npm run build:generate-sync
```

## Monitoring and Observability

### Build Metrics
- **Build Duration**: Track image processing time
- **Upload Success Rate**: Monitor sync failures
- **Image Count**: Track collection growth
- **File Sizes**: Monitor storage usage

### Runtime Metrics
- **CDN Hit Rate**: Via Cloudflare Analytics
- **Response Times**: Image load performance
- **Error Rates**: 404s and timeouts
- **Geographic Distribution**: User locations

### Alerting Thresholds
- **Build Failure**: Immediate notification
- **Upload Errors**: > 5% failure rate
- **CDN Issues**: Response time > 2s
- **Cost Spike**: > 150% of average

## Disaster Recovery

### Backup Strategy
- **Source Images**: Retained in /public/
- **Processed Images**: Can regenerate from source
- **R2 Versioning**: Optional for rollback
- **Git History**: Source data versioned

### Recovery Scenarios
1. **R2 Outage**: Failover to backup CDN
2. **Build Failure**: Use previous build cache
3. **Data Loss**: Rebuild from Python scraper
4. **Corruption**: Validate with checksums

## Platform Evolution

### Short-term Enhancements
- **WebP Support**: Modern format adoption
- **Build Cache**: Speed up deployments
- **Selective Sync**: Only changed images
- **Metrics Dashboard**: Build insights

### Long-term Vision
- **Edge Processing**: Cloudflare Workers for transforms
- **Multi-Region**: Geographic replication
- **AI Enhancement**: Automatic image optimization
- **API Gateway**: Dynamic image serving

## Security Considerations

### Access Control
- **Build Server**: Only system with write access
- **Public Read**: All images publicly accessible
- **No Direct Upload**: Images only via build pipeline
- **Audit Logging**: Track all R2 operations

### Data Protection
- **HTTPS Only**: Encrypted in transit
- **No PII**: Images contain no personal data
- **Version Control**: Track all changes
- **Access Logs**: Monitor unusual patterns