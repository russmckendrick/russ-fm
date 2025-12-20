# Russ.fm - Discogs Collection Showcase

A modern, full-stack music collection management and showcase system that combines a powerful Python-based data enrichment engine with a beautiful React frontend to display your Discogs record collection.

See it in action at [Russ.fm](https://www.russ.fm).

## Features

### Data Collection & Enrichment
- **Multi-Service Integration**: Enriches data from Discogs, Apple Music, Spotify, Wikipedia, Last.fm, and Perplexity AI
- **Multi-Artist Support**: Handles albums with multiple artists, collaborations, and compilations
- **High-Quality Images**: Multiple resolution album artwork and artist photos
- **Resume Capability**: Robust processing with database persistence

### Web Interface
- **Modern React UI**: Built with React 19, TypeScript, Vite, and shadcn/ui
- **Real-time Search**: Search across albums, artists, and genres
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Statistics Dashboard**: Collection insights with charts and growth metrics
- **Service Integration**: Direct links to streaming services and Last.fm scrobbling

## Documentation

Comprehensive documentation is available in the [`docs/`](./docs/) folder:

| Section | Description |
|---------|-------------|
| [Getting Started](./docs/getting-started/) | Prerequisites, setup, and first run |
| [Architecture](./docs/architecture/) | System diagrams and design patterns |
| [Frontend](./docs/frontend/) | React components, pages, hooks, utilities |
| [Backend](./docs/backend/) | CLI commands, services, orchestration |
| [Data](./docs/data/) | JSON schemas and data models |
| [Build Pipeline](./docs/build-pipeline/) | Asset processing and deployment |
| [API Integrations](./docs/api-integrations/) | Discogs, Apple Music, Spotify, Last.fm, etc. |
| [Development](./docs/development/) | Configuration and troubleshooting |

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Run linting: `pnpm run lint`
5. Commit and push
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- Built with [Discogs API](https://www.discogs.com/developers/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/) and [React Icons](https://react-icons.github.io/react-icons/)
- Charts powered by [Recharts](https://recharts.org/)

---

[**Russ.fm**](https://www.russ.fm) - Showcasing music collections with modern web technology
