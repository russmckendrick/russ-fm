# Russ.fm - Discogs Collection Showcase

A modern, full-stack music collection management and showcase system that combines a powerful Python-based data enrichment engine with a beautiful React frontend to display your Discogs record collection.

See is at [Russ.fm](https://www.russ.fm).

## 🎵 Project Overview

This project consists of two main components:

1. **Music Collection Manager** (`/scrapper/`) - A sophisticated Python application that enriches Discogs collection data with information from multiple music APIs
2. **React Frontend** (`/src/`) - A modern Single Page Application that beautifully displays your enriched music collection

## 🚀 Features

### Data Collection & Enrichment
- **Multi-Service Integration**: Enriches data from Discogs, Apple Music, Spotify, Wikipedia, and Last.fm
- **Multi-Artist Support**: Handles albums with multiple artists (collaborations, featured artists)
- **Artist Information**: Comprehensive artist profiles with biographies and external service links
- **High-Quality Images**: Multiple resolution album artwork and artist photos
- **Smart Matching**: Interactive mode for accurate data matching across services
- **Resume Capability**: Robust processing with database persistence and resume functionality

### Web Interface
- **Modern React UI**: Built with React 19, TypeScript, and shadcn/ui components
- **Responsive Design**: Beautiful layouts that work on desktop, tablet, and mobile
- **Advanced Search**: Real-time search across albums, artists, and genres with overlay results
- **Comprehensive Filtering**: Sort by date added, name, year, album count with genre filtering
- **Detailed Views**: Rich album and artist detail pages with service integration
- **Statistics Dashboard**: Collection insights with charts and growth metrics
- **Pagination**: Efficient browsing with configurable items per page

### Smart Features
- **Various Artist Handling**: Special handling for compilation albums with proper filtering
- **Genre Filtering**: Intelligent genre tag processing with non-genre term removal
- **Service Integration**: Direct links to streaming services, Last.fm scrobbling, and Discogs
- **Biography Management**: Artist biographies with smart truncation and expandable sections
- **Image Optimization**: Multiple image sizes for optimal loading performance

## 📁 Project Structure

```
discogs-v2/
├── scrapper/                   # Python data collection engine
│   ├── music_collection_manager/  # Core Python package
│   │   ├── cli/               # Command-line interface
│   │   ├── config/            # Configuration management
│   │   ├── models/            # Data models
│   │   ├── services/          # API service implementations
│   │   └── utils/             # Database and orchestration
│   ├── main.py               # Entry point for collection processing
│   ├── config.json           # API credentials configuration
│   └── collection_cache.db   # SQLite database for caching
├── src/                      # React frontend application
│   ├── components/           # Reusable UI components
│   ├── pages/               # Page components
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utility functions
│   └── config/              # Application configuration
├── public/                  # Static assets and generated data
│   ├── collection.json      # Main collection data
│   ├── album/              # Album-specific JSON and images
│   └── artist/             # Artist-specific JSON and images
└── dist/                   # Built React application
```

## 🛠️ Technology Stack

### Backend (Data Collection)
- **Python 3.8+** with modern architecture patterns
- **SQLite** for local data caching and progress tracking
- **Rich CLI** with beautiful command-line interface
- **Multiple API Integrations**: Discogs, Apple Music, Spotify, Wikipedia, Last.fm
- **Robust Error Handling** with retry logic and graceful degradation

### Frontend (Web Interface)
- **React 19** with TypeScript for type safety
- **Vite** for fast development and building
- **shadcn/ui** components built on Radix UI primitives
- **Tailwind CSS** for styling with custom design system
- **React Router** for client-side routing
- **Recharts** for data visualization

## 🚀 Quick Start

### 1. Set Up Data Collection

```bash
# Navigate to the scrapper directory
cd scrapper

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Unix/macOS
# or: venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt
pip install -e .

# Create configuration
python main.py init
cp config.example.json config.json
# Edit config.json with your API credentials
```

### 2. Configure API Credentials

Edit `scrapper/config.json` with your API credentials:

#### Discogs (Required)
```json
{
  "discogs": {
    "access_token": "your_discogs_token",
    "username": "your_username"
  }
}
```

#### Optional Services (for enhanced data)
```json
{
  "apple_music": {
    "key_id": "your_key_id",
    "team_id": "your_team_id",
    "private_key_path": "apple_private_key.p8"
  },
  "spotify": {
    "client_id": "your_client_id",
    "client_secret": "your_client_secret"
  },
  "lastfm": {
    "api_key": "your_api_key"
  }
}
```

### 3. Process Your Collection

```bash
# Test your setup
python main.py test

# Process your entire collection
python main.py collection

# Or start with a limited batch
python main.py collection --limit 10
```

### 4. Set Up the Frontend

```bash
# Navigate back to project root
cd ..

# Install frontend dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:5173` to see your collection!

## 📖 Detailed Documentation

### Data Collection Commands

#### Single Release Processing
```bash
# Process a specific Discogs release
python main.py release 123456 --save

# Interactive mode for manual matching
python main.py release 123456 --interactive

# Custom search terms for better matching
python main.py release 123456 --search "Custom Album Title"

# Custom artwork override
python main.py release 123456 --custom-cover "https://example.com/cover.jpg"
```

#### Collection Processing
```bash
# Full collection with resume capability
python main.py collection --resume

# Process specific range
python main.py collection --from 20 --to 40

# Custom batch size
python main.py collection --batch-size 5
```

#### Artist Information
```bash
# Get comprehensive artist data
python main.py artist "Artist Name" --save

# Custom artist image
python main.py artist "Artist Name" --custom-image "https://example.com/photo.jpg"
```

### Frontend Development

#### Available Scripts
```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run lint       # Run ESLint
npm run preview    # Preview production build
```

#### Configuration
- **Pagination**: Configurable in `src/config/app.config.ts`
- **Styling**: Custom Tailwind configuration in `tailwind.config.js`
- **Components**: shadcn/ui components in `src/components/ui/`

## 🎯 Key Features in Detail

### Multi-Artist Support
The system intelligently handles albums with multiple artists:
- Individual artist pages for each collaborator
- Proper display of artist avatars on album pages
- Separate artist biographies and information
- Smart filtering to exclude "Various" compilation artists

### Search & Discovery
- **Real-time Search**: Search across album titles, artist names, and genres
- **Advanced Filtering**: Filter by genre, year, or first letter of artist name
- **Search Overlay**: Context-aware search popup with rich result cards
- **Smart Routing**: Conditional search behavior based on current page

### Data Quality
- **Genre Filtering**: Removes non-genre terms like "Deluxe Edition" from genre tags
- **Image Management**: Multiple resolution images (hi-res, medium, small) for optimal loading
- **Service Integration**: Links to streaming services with fallback handling
- **Biography Processing**: Clean, formatted artist biographies with smart truncation

### User Experience
- **Responsive Design**: Works beautifully on all screen sizes
- **Fast Navigation**: Client-side routing for instant page transitions
- **Progressive Loading**: Lazy loading for images and optimized performance
- **Error Handling**: Graceful fallbacks for missing data or failed requests

## 🔧 API Credentials Setup

### Discogs (Required)
1. Visit [Discogs Developer Settings](https://www.discogs.com/settings/developers)
2. Generate a Personal Access Token
3. Add your username and token to the config

### Apple Music (Optional - Premium Feature)
1. Join the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)
2. Create a MusicKit identifier
3. Download the private key (.p8 file)
4. Configure with key ID, team ID, and private key path

### Spotify (Optional)
1. Create an app at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Get Client ID and Client Secret
3. Add to configuration

### Last.fm (Optional)
1. Get API key from [Last.fm API](https://www.last.fm/api/account/create)
2. Add to configuration

## 🚀 Deployment

### Building for Production
```bash
# Build the React application
npm run build

# The built files will be in the /dist directory
```

### Server Configuration
The frontend is a Single Page Application (SPA) that requires server configuration to handle client-side routing. See `DEPLOYMENT.md` for detailed server setup instructions.

### Static File Serving
Ensure your web server can serve:
- Static assets from `/public/` directory
- Album data and images from `/public/album/` and `/public/artist/`
- The main collection data from `/public/collection.json`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Run tests and linting: `npm run lint`
5. Commit your changes: `git commit -m 'Add feature'`
6. Push to the branch: `git push origin feature-name`
7. Submit a pull request

## 📋 Common Workflows

### Adding New Albums
1. Add albums to your Discogs collection
2. Run `python main.py collection --resume` to process new additions
3. The frontend will automatically show new albums on next reload

### Updating Existing Data
```bash
# Force refresh a specific album
python main.py release 123456 --force-refresh --save

# Update artist information
python main.py artist "Artist Name" --force-refresh --save
```

### Backup and Maintenance
```bash
# Backup your database
python main.py backup

# Check processing status
python main.py status

# Test all API connections
python main.py test
```

## 🐛 Troubleshooting

### Common Issues
- **Images not loading**: Check that static file serving is configured correctly
- **Search not working**: Verify `/collection.json` is accessible
- **API errors**: Run `python main.py test` to check credentials
- **Build errors**: Ensure all dependencies are installed with `npm install`

### Debug Mode
```bash
# Enable debug logging
python main.py --log-level DEBUG collection

# Check logs
tail -f logs/music_collection_manager_*.log
```

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- Built with [Discogs API](https://www.discogs.com/developers/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/) and [React Icons](https://react-icons.github.io/react-icons/)
- Charts powered by [Recharts](https://recharts.org/)

---

[**Russ.fm**](https://www.russ.fm) - Showcasing music collections with modern web technology 🎵