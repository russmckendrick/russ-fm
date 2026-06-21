# Development Guide

This guide covers local development workflows, testing, and best practices.

## Quick Links

| Document | Description |
|----------|-------------|
| [Configuration](./configuration.md) | All configuration options |
| [Troubleshooting](./troubleshooting.md) | Common issues and solutions |

## Development Environment

### Prerequisites

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 22.19.0+ | Frontend development and Workers deployment tooling |
| pnpm | 10.x+ | Package manager |
| Rust | Latest stable (via rustup) | Backend data processing |
| Git | Latest | Version control |

### Initial Setup

```bash
# Clone repository
git clone https://github.com/russmckendrick/russ-fm.git
cd russ-fm

# Frontend setup
pnpm install

# Backend setup (Rust TUI/CLI binary)
cd scrapper
./install.sh           # builds and installs `scrapper` to ~/.cargo/bin,
                       # and registers ~/.config/scrapper/config.json so the
                       # command works from any directory
cp config.example.json config.json
# Edit config.json with your API credentials
```

> To run against source without installing, use `cargo run -- <cmd>` from inside `scrapper/`.

## Frontend Development

### Development Server

```bash
# Start with hot reload
pnpm run dev

# Access at http://localhost:5173
```

### Available Commands

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Start dev server |
| `pnpm run build` | Production build |
| `pnpm run build:fast` | Build without assets |
| `pnpm run lint` | Run ESLint |
| `pnpm run tsc --noEmit` | Type check |
| `pnpm run preview` | Preview production build |

### Hot Reload Behavior

- **TypeScript/JSX changes**: Instant HMR
- **CSS changes**: Instant HMR
- **Public JSON changes**: Full page reload
- **Image changes**: Processed on-demand

### Image Processing in Dev

Vite middleware processes images on-demand:

```
Request: /album/slug/slug-medium.jpg
→ Check if hi-res exists
→ Process with Sharp
→ Serve from memory
```

No need to run `process-images` during development.

## Backend Development

The backend is the `scrapper` Rust binary. Once installed via `./install.sh` it runs
from any directory. For source dev without installing, substitute `cargo run -- <cmd>`
(run from inside `scrapper/`) for `scrapper <cmd>` below.

### Common Operations

```bash
# Test API connections
scrapper test

# Process single album
scrapper release 123456 --save

# Resume collection processing
scrapper collection --resume

# Check status
scrapper status
```

### Debug Mode

```bash
# Verbose logging (logs go to stderr)
scrapper --log-level DEBUG release 123456

# Capture logs to a file by redirecting stderr
scrapper --log-level DEBUG release 123456 2> run.log
```

## Project Structure

```
russ-fm/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── pages/             # Route pages
│   ├── hooks/             # Custom hooks
│   ├── lib/               # Utilities
│   ├── services/          # API services
│   ├── types/             # TypeScript types
│   └── config/            # Configuration
├── scrapper/              # Rust backend (TUI/CLI binary)
│   ├── src/               # Rust source
│   ├── install.sh         # Build & install to ~/.cargo/bin
│   └── Cargo.toml         # Crate manifest
├── public/                # Static data
│   ├── collection.json    # Album index
│   ├── album/             # Album data
│   └── artist/            # Artist data
├── scripts/               # Build scripts
└── docs/                  # Documentation
```

## Development Workflow

### Adding a New Album

1. Find Discogs release ID
2. Process with backend:
   ```bash
   scrapper release 123456 --save
   ```
3. Regenerate collection index:
   ```bash
   scrapper generate-collection
   ```
4. Refresh frontend (dev server picks up changes)

### Modifying Frontend

1. Start dev server: `pnpm run dev`
2. Edit files in `src/`
3. Changes hot reload automatically
4. Type check: `pnpm run tsc --noEmit`
5. Lint: `pnpm run lint`

### Adding Backend Features

1. Edit files in `scrapper/src/`
2. Test with: `cargo run -- <command>` (from inside `scrapper/`)
3. Build and reinstall with `./install.sh` when ready
4. Check logs for errors

## Code Style

### Frontend (TypeScript)

- Use TypeScript strict mode
- Prefer functional components
- Use custom hooks for logic
- Use shadcn/ui components
- Use Tailwind utilities

```typescript
// Good
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function MyComponent({ className }: { className?: string }) {
  return (
    <Button className={cn('base-styles', className)}>
      Click
    </Button>
  );
}
```

### Backend (Rust)

- Run `cargo fmt` and `cargo clippy` before committing
- Use structs/enums for models and `Result` for error handling
- Use the logging facade, not `println!`, for diagnostics
- Keep the static data contract intact (slugs, JSON shapes, image sizes)

## Testing

### Frontend

```bash
# Type checking
pnpm run tsc --noEmit

# Linting
pnpm run lint

# Build verification
pnpm run build
```

### Backend

```bash
# Test API connections
scrapper test

# Dry run collection
scrapper collection --dry-run --limit 5

# Check specific release
scrapper release 123456
```

## Environment Variables

### Frontend (.env)

```bash
# Only needed for production R2 access
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-key
R2_SECRET_ACCESS_KEY=your-secret
R2_BUCKET_NAME=russ-fm-assets
R2_PUBLIC_DOMAIN=https://assets.russ.fm

# Feature flags
VITE_SCROBBLING_ENABLED=true
```

### Backend (config.json)

```json
{
  "discogs": {
    "access_token": "...",
    "username": "..."
  },
  "apple_music": {
    "key_id": "...",
    "team_id": "...",
    "private_key_path": "..."
  }
  // ... other services
}
```

## Git Workflow

### Branch Strategy

- `main` - Production branch (auto-deploys)
- Feature branches for development

### Commit Messages

```
feat: Add dark mode toggle
fix: Correct image loading on mobile
docs: Update API documentation
refactor: Simplify color extraction
```

### Pre-commit Checks

```bash
# Before committing
pnpm run lint
pnpm run tsc --noEmit
pnpm run build
```

## Performance Tips

### Frontend

1. Use `React.memo` for expensive renders
2. Lazy load routes
3. Use appropriate image sizes
4. Debounce search input

### Backend

1. Use `--resume` for large collections
2. Process in batches
3. Use database cache
4. Monitor rate limits

## Debugging

### Frontend

```typescript
// Use React DevTools
// Check Network tab for fetch failures
// Use console.log sparingly

console.log('Debug:', { album, colors });
```

### Backend

```bash
# Enable debug logging
scrapper --log-level DEBUG release 123456

# Prefer a specific image/data source
scrapper release 123456 --prefer apple-music

# Interactive mode
scrapper release 123456 --interactive
```

## Related Documentation

- [Configuration Reference](./configuration.md)
- [Troubleshooting Guide](./troubleshooting.md)
- [Build Pipeline](../build-pipeline/)
- [Deployment](../build-pipeline/deployment.md)
