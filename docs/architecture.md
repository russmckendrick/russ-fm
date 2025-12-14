# System Architecture

This document outlines the high-level architecture of the Russ.fm project, illustrating how the data collection engine, frontend application, and deployment pipeline interact.

## High-Level Overview

The system follows a **Static Data, Dynamic UI** pattern. The backend runs offline to generate a static dataset, which the frontend consumes at runtime. This deciphers the complexity of real-time API aggregation from the user experience.

```mermaid
graph TD
    User[User] -->|Visits| Web[Web App (Cloudflare Workers)]
    Web -->|Fetches Data| R2[Cloudflare R2 Storage]
    
    subgraph "Offline Data Processing"
        Scrapper[Python Scrapper] -->|Writes| LocalDB[(SQLite Cache)]
        Scrapper -->|Generates| JSON[Static JSON Files]
        Scrapper -->|Downloads| Images[Image Assets]
    end
    
    subgraph "External APIs"
        Discogs[Discogs]
        Apple[Apple Music]
        Spotify[Spotify]
        LastFM[Last.fm]
        Wiki[Wikipedia]
        Perplexity[Perplexity AI]
    end
    
    Scrapper <--> Discogs
    Scrapper <--> Apple
    Scrapper <--> Spotify
    Scrapper <--> LastFM
    Scrapper <--> Wiki
    Scrapper <--> Perplexity
    
    JSON -->|Deployed to| R2
    Images -->|Deployed to| R2
```

## Data Enrichment Pipeline

The core value of the system is the data enrichment pipeline, which transforms raw Discogs data into a rich media experience.

```mermaid
sequenceDiagram
    participant D as Discogs
    participant S as Scrapper
    participant DB as SQLite Cache
    participant Ext as Enrichment APIs
    participant FS as File System

    S->>D: Fetch Collection/Release
    S->>DB: Check Cache
    alt Data Cached
        DB-->>S: Return Cached Data
    else New or Stale
        S->>Ext: Search & Enrich (Apple/Spotify/Wiki)
        alt Desc Missing
            S->>Ext: Generate Desc (Perplexity AI)
        end
        S->>DB: Save to Cache
    end
    S->>FS: Generate JSON (album/slug.json)
    S->>FS: Download & Resize Images
```

## Deployment Architecture

The deployment pipeline is automated via GitHub Actions, ensuring that both code and data assets are synchronized efficiently.

```mermaid
flowchart LR
    Push[Git Push to Main] --> GH[GitHub Actions]
    
    subgraph "CI/CD Pipeline"
        direction TB
        Job1[Asset Optimization]
        Job2[Build Frontend]
        Job3[Sync Assets]
        Job4[Deploy Worker]
        
        Job1 -->|Generate| Colors[Album Colors]
        Job1 -->|Generate| OG[OG Images]
        Job1 --> Job2
        Job2 --> Job3
        Job3 -->|Rclone/Upload| R2[(Cloudflare R2)]
        Job3 --> Job4
    end
    
    Job4 -->|Publish| Worker[Cloudflare Worker]
```

## Data Models

### Release Data Structure

The generated JSON files (`/public/album/{slug}.json`) follow a schema optimized for frontend consumption:

-   **`id`**: Discogs Release ID
-   **`slug`**: URL-friendly identifier
-   **`artists`**: List of artists (handling collaborations)
-   **`title`**: Album title
-   **`images_uri_release`**: Map of image URLs (`hi-res`, `medium`)
-   **`raw_data`**: Enriched data from all services
    -   `spotify`: ID, popularity, URL
    -   `apple_music`: Editorial notes, tracklist, genre
    -   `lastfm`: Play counts, tags
    -   `wiki`: Content summary
    -   `perplexity`: AI-generated description
