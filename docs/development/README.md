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
| Node.js | 20.x+ | Frontend development |
| pnpm | 8.x+ | Package manager |
| Python | 3.8+ | Backend data processing |
| Git | Latest | Version control |

### Initial Setup

```bash
# Clone repository
git clone https://github.com/russmckendrick/russ-fm.git
cd russ-fm

# Frontend setup
pnpm install

# Backend setup
cd scrapper
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
pip install -e .
cp config.example.json config.json
# Edit config.json with your API credentials
```

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

### Virtual Environment

```bash
cd scrapper
source venv/bin/activate  # Always activate first

# Deactivate when done
deactivate
```

### Common Operations

```bash
# Test API connections
python main.py test

# Process single album
python main.py release 123456 --save

# Resume collection processing
python main.py collection --resume

# Check status
python main.py status
```

### Debug Mode

```bash
# Verbose logging
python main.py --log-level DEBUG release 123456

# Check logs
tail -f logs/music_collection_manager.log
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
├── scrapper/              # Python backend
│   ├── music_collection_manager/
│   │   ├── services/      # API clients
│   │   ├── utils/         # Orchestration
│   │   ├── models/        # Data models
│   │   └── cli/           # CLI commands
│   └── main.py            # Entry point
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
   cd scrapper
   source venv/bin/activate
   python main.py release 123456 --save
   ```
3. Regenerate collection index:
   ```bash
   python main.py generate-collection
   ```
4. Refresh frontend (dev server picks up changes)

### Modifying Frontend

1. Start dev server: `pnpm run dev`
2. Edit files in `src/`
3. Changes hot reload automatically
4. Type check: `pnpm run tsc --noEmit`
5. Lint: `pnpm run lint`

### Adding Backend Features

1. Activate venv
2. Edit files in `scrapper/music_collection_manager/`
3. Test with: `python main.py <command>`
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

### Backend (Python)

- Use type hints
- Use dataclasses for models
- Follow PEP 8
- Use logging, not print

```python
from dataclasses import dataclass
from typing import Optional

@dataclass
class MyModel:
    name: str
    value: Optional[int] = None

    def process(self) -> str:
        self.logger.info(f"Processing {self.name}")
        return self.name.upper()
```

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
python main.py test

# Dry run collection
python main.py collection --dry-run --limit 5

# Check specific release
python main.py release 123456
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
python main.py --log-level DEBUG release 123456

# Check specific service
python main.py release 123456 --services "discogs,apple_music"

# Interactive mode
python main.py release 123456 --interactive
```

## Related Documentation

- [Configuration Reference](./configuration.md)
- [Troubleshooting Guide](./troubleshooting.md)
- [Build Pipeline](../build-pipeline/)
- [Deployment](../build-pipeline/deployment.md)
