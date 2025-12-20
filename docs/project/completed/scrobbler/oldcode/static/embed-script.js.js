export const EMBED_JS_CONTENT = `
class EmbedScrobbler {
    constructor() {
        this.discogsId = null;
        this.albumData = null;
        this.isAuthenticated = false;
        this.init();
    }

    init() {
        // Extract Discogs ID from URL
        this.discogsId = this.extractDiscogsId();
        
        if (!this.discogsId) {
            this.showError('Invalid Discogs ID in URL');
            return;
        }

        // Start the process
        this.checkAuthentication();
    }

    extractDiscogsId() {
        const path = window.location.pathname;
        const match = path.match(/\\/embed\\/(\\d+)\\/?$/);
        return match ? match[1] : null;
    }

    async checkAuthentication() {
        try {
            const response = await fetch('/api/auth/status');
            const data = await response.json();
            
            console.log('Auth status response:', data);
            
            if (data.authenticated) {
                this.isAuthenticated = true;
                this.updateStatus('Authenticated as ' + data.user.username, 'loading');
                this.fetchAlbumData();
            } else {
                this.showLoginRequired();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            this.showError('Failed to check authentication status');
        }
    }

    showLoginRequired() {
        document.getElementById('loading-state').classList.add('d-none');
        document.getElementById('login-state').classList.remove('d-none');
        
        // Set up login link
        document.getElementById('login-link').addEventListener('click', async (e) => {
            e.preventDefault();
            await this.handleLogin();
        });
    }

    async handleLogin() {
        try {
            const response = await fetch('/api/auth/login', { method: 'POST' });
            const data = await response.json();
            
            if (data.authUrl) {
                // Open login in the same window
                window.location.href = data.authUrl;
            } else {
                this.showError('Failed to initiate login');
            }
        } catch (error) {
            console.error('Login failed:', error);
            this.showError('Login failed');
        }
    }

    async fetchAlbumData() {
        try {
            this.updateStatus('Fetching album data...', 'loading');
            
            const response = await fetch(\`/api/search/discogs/release/\${this.discogsId}\`);
            const data = await response.json();
            
            if (response.ok) {
                this.albumData = data;
                this.displayAlbum();
                this.startScrobbling();
            } else {
                this.showError(data.error || 'Failed to fetch album data');
            }
        } catch (error) {
            console.error('Failed to fetch album:', error);
            this.showError('Failed to fetch album data');
        }
    }

    displayAlbum() {
        document.getElementById('loading-state').classList.add('d-none');
        document.getElementById('album-state').classList.remove('d-none');
        
        // Set album cover
        const coverImg = document.getElementById('album-cover');
        if (this.albumData.images && this.albumData.images.length > 0) {
            coverImg.src = this.albumData.images[0].uri || '/placeholder-album.jpg';
        } else {
            coverImg.src = '/placeholder-album.jpg';
        }
        
        // Set album title and artist
        document.getElementById('album-title').textContent = this.albumData.title;
        document.getElementById('artist-name').textContent = 
            this.albumData.artists && this.albumData.artists.length > 0 
                ? this.albumData.artists[0].name 
                : 'Unknown Artist';
    }

    async startScrobbling() {
        try {
            this.updateStatus('Scrobbling to Last.fm...', 'loading');
            
            // Extract artist, album, and tracks from albumData
            const artist = this.albumData.artists && this.albumData.artists.length > 0 
                ? this.albumData.artists[0].name 
                : 'Unknown Artist';
            const album = this.albumData.title;
            const tracks = this.albumData.tracklist || [];
            
            console.log('Album data:', this.albumData);
            console.log('Extracted data:', { artist, album, tracks: tracks.length });
            
            if (tracks.length === 0) {
                this.showError('No tracks found in this album');
                return;
            }
            
            const requestBody = {
                artist: artist,
                album: album,
                tracks: tracks
            };
            
            console.log('Sending scrobble request:', requestBody);
            
            const response = await fetch('/api/scrobble/album', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            
            const result = await response.json();
            console.log('Scrobble response:', result);
            
            if (response.ok && result.success) {
                this.showSuccess(\`Successfully scrobbled \${result.summary.successful} of \${result.summary.total} tracks!\`);
            } else {
                this.showError(result.error || 'Scrobbling failed');
            }
        } catch (error) {
            console.error('Scrobbling failed:', error);
            this.showError('Scrobbling failed');
        }
    }

    updateStatus(message, type) {
        const container = document.getElementById('status-container');
        const statusClass = type === 'loading' ? 'status-loading' : 
                           type === 'success' ? 'status-success' : 'status-error';
        
        const icon = type === 'loading' ? '<div class="spinner-border spinner-border-sm me-2"></div>' :
                     type === 'success' ? '<i class="bi bi-check-circle me-2"></i>' :
                     '<i class="bi bi-exclamation-triangle me-2"></i>';
        
        container.innerHTML = \`
            <div class="status-message \${statusClass}">
                \${icon}\${message}
            </div>
        \`;
    }

    showSuccess(message) {
        this.updateStatus(message, 'success');
        this.showCloseButton();
        
        // Auto-close after 3 seconds
        setTimeout(() => {
            this.closeWindow();
        }, 3000);
    }

    showError(message) {
        this.updateStatus(message, 'error');
        this.showCloseButton();
        
        // Auto-close after 5 seconds for errors
        setTimeout(() => {
            this.closeWindow();
        }, 5000);
    }

    showCloseButton() {
        const closeBtn = document.getElementById('close-btn');
        closeBtn.classList.remove('d-none');
        closeBtn.addEventListener('click', () => {
            this.closeWindow();
        });
    }

    closeWindow() {
        try {
            // Try to close the popup window
            window.close();
            
            // If window.close() doesn't work (popup blockers, etc.)
            // Show a message after a short delay
            setTimeout(() => {
                if (!window.closed) {
                    this.updateStatus('Please close this window manually', 'error');
                }
            }, 1000);
        } catch (error) {
            console.error('Failed to close window:', error);
            this.updateStatus('Please close this window manually', 'error');
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Don't initialize if we're handling an auth callback
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.get('token')) {
        new EmbedScrobbler();
    }
});

// Handle authentication callback
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('token')) {
        // This is a callback from Last.fm authentication
        // Process the callback and then restart the embed flow
        handleAuthCallback(urlParams.get('token'));
    }
});

async function handleAuthCallback(token) {
    try {
        // Call the auth callback endpoint to process the token
        const response = await fetch('/api/auth/callback?' + new URLSearchParams({ token }));
        const result = await response.json();
        
        if (result.success) {
            // Authentication successful, remove query params and restart
            window.history.replaceState({}, document.title, window.location.pathname);
            // Wait a bit longer to ensure session is established
            setTimeout(() => {
                new EmbedScrobbler();
            }, 1000);
        } else {
            console.error('Auth callback failed:', result);
            // Still try to restart in case of edge cases
            setTimeout(() => {
                window.location.href = window.location.pathname;
            }, 1000);
        }
    } catch (error) {
        console.error('Auth callback error:', error);
        // Fallback to simple redirect
        setTimeout(() => {
            window.location.href = window.location.pathname;
        }, 1000);
    }
}
`; 