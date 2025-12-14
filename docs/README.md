# Russ.fm Documentation

Welcome to the documentation for **Russ.fm**, a modern, full-stack music collection management and showcase system.

## 🎵 Project Overview

Russ.fm combines a powerful Python-based data enrichment engine with a beautiful React frontend to manage and display your Discogs record collection. It goes beyond simple cataloging by enriching your data with editorial content, high-quality artwork, and streaming links from multiple services.

### Key Features

-   **Multi-Service Integration**: Enriches data from Discogs, Apple Music, Spotify, Wikipedia, and Last.fm.
-   **Modern React UI**: A responsive, beautiful interface built with React 19, TypeScript, and shadcn/ui.
-   **Smart Enrichment**: Handles multi-artist albums, finding high-res artwork, and generating descriptions via Perplexity AI.
-   **Robust Backend**: Python-based engine with SQLite caching, resume capability, and comprehensive CLI.
-   **Production Ready**: Automated CI/CD pipeline with Cloudflare R2 storage and Workers deployment.

## 📚 Documentation Contents

-   **[Getting Started](./getting-started.md)**: Prerequisites, installation, and quick start guide.
-   **[Data Collection](./data-collection.md)**: Detailed guide to the Python backend scrapper/manager.
-   **[Frontend Development](./frontend.md)**: Architecture, components, and working with the React application.
-   **[Brand & Style Guide](./brand-guide.md)**: Typography, color palette, and Neo-Glass design system tokens.
-   **[System Architecture](./architecture.md)**: High-level design, relationships, and data flow diagrams.
-   **[Deployment](./deployment.md)**: CI/CD workflows, Cloudflare R2 sync, and production setup.
-   **[Tools & Utilities](./tools.md)**: Database management, maintenance scripts, and troubleshooting.
-   **[Available Commands](./commands.md)**: Reference for all `package.json` scripts.

## 🔗 Quick Links

-   [Live Site](https://www.russ.fm)
-   [GitHub Repository](https://github.com/russmckendrick/russ-fm)
