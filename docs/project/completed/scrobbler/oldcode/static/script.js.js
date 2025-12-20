export const JS_CONTENT = `// RUSS FM SCROBBLER - FRONTEND JAVASCRIPT

class ScrobblerApp {
    constructor() {
        this.currentUser = null;
        this.searchResults = [];
        this.selectedAlbum = null;
        this.currentPage = 1;
        this.totalPages = 1;
        this.exampleSearches = [];
        this.currentDiscogsSuggestion = null;
        this.currentAlbumSuggestion = null;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkAuthStatus();
        this.fetchExampleSearches();
        
        // Handle direct album URLs after everything is initialized
        this.handleDirectAlbumURL();
        this.fetchExampleSearches();
    }

    bindEvents() {
        // Authentication
        document.getElementById('login-btn').addEventListener('click', () => this.login());
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());

        // Search buttons
        document.getElementById('discogs-search-btn').addEventListener('click', () => this.performDiscogsSearch());
        document.getElementById('album-search-btn').addEventListener('click', () => this.performAlbumSearch());
        
        // Enter key support for search inputs
        document.getElementById('release-id').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performDiscogsSearch();
        });
        document.getElementById('album-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performAlbumSearch();
        });
        
        // Clear suggestions when user types in the input fields
        document.getElementById('release-id').addEventListener('input', () => {
            this.currentDiscogsSuggestion = null;
        });
        document.getElementById('album-name').addEventListener('input', () => {
            this.currentAlbumSuggestion = null;
        });

        // Album actions
        document.getElementById('scrobble-all-btn').addEventListener('click', () => this.scrobbleAlbum());
        document.getElementById('clear-selection-btn').addEventListener('click', () => this.clearSelection());
        
        // Refresh artwork button (will be bound when user header is shown)
        this.bindRefreshArtworkButton();
    }

    bindRefreshArtworkButton() {
        const refreshBtn = document.getElementById('refresh-artwork-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshAlbumArtwork());
        }
    }

    async checkAuthStatus() {
        try {
            const response = await fetch('/api/auth/status');
            const data = await response.json();
            
            if (data.authenticated) {
                this.currentUser = data.user;
                this.updateUserStatus(true);
            } else {
                this.updateUserStatus(false);
            }
        } catch (error) {
            console.error('Auth status check failed:', error);
            this.updateUserStatus(false);
        }
    }

    updateUserStatus(authenticated) {
        const userInfo = document.getElementById('user-info');
        const loginBtn = document.getElementById('login-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const defaultHeader = document.getElementById('default-header');
        const userHeader = document.getElementById('user-header');

        if (authenticated && this.currentUser) {
            userInfo.textContent = \`Logged in as \${this.currentUser.username}\`;
            loginBtn.classList.add('d-none');
            logoutBtn.classList.remove('d-none');
            
            // Show user header and hide default header
            defaultHeader.classList.add('d-none');
            userHeader.classList.remove('d-none');
            
            // Populate user header with account information
            this.populateUserHeader();
            
            // Bind refresh artwork button
            this.bindRefreshArtworkButton();
        } else {
            userInfo.textContent = 'Not logged in';
            loginBtn.classList.remove('d-none');
            logoutBtn.classList.add('d-none');
            
            // Show default header and hide user header
            defaultHeader.classList.remove('d-none');
            userHeader.classList.add('d-none');
        }
    }

    populateUserHeader() {
        if (!this.currentUser || !this.currentUser.userInfo) return;
        
        const userInfo = this.currentUser.userInfo;
        
        // Set user display name (use realname if available, otherwise username)
        const displayName = userInfo.realname || userInfo.name || this.currentUser.username;
        document.getElementById('user-display-name').textContent = displayName;
        
        // Show Pro badge if user is a subscriber
        const proBadge = document.getElementById('user-pro-badge');
        if (userInfo.subscriber && parseInt(userInfo.subscriber) === 1) {
            proBadge.classList.remove('d-none');
        } else {
            proBadge.classList.add('d-none');
        }
        
        // Set user avatar
        const avatar = document.getElementById('user-avatar');
        if (userInfo.image && userInfo.image.length > 0) {
            // Find the largest available image
            const largeImage = userInfo.image.find(img => img.size === 'extralarge') ||
                              userInfo.image.find(img => img.size === 'large') ||
                              userInfo.image.find(img => img.size === 'medium') ||
                              userInfo.image[0];
            
            if (largeImage && largeImage['#text']) {
                avatar.src = largeImage['#text'];
                avatar.style.display = 'block';
            } else {
                avatar.style.display = 'none';
            }
        } else {
            avatar.style.display = 'none';
        }
        
        // Set playcount
        const playcount = userInfo.playcount ? parseInt(userInfo.playcount).toLocaleString() : '0';
        document.getElementById('user-playcount').textContent = playcount;
        
        // Set registration date
        if (userInfo.registered) {
            let regDate;
            
            // Try to use the unixtime attribute first (more reliable)
            if (userInfo.registered.unixtime) {
                regDate = new Date(parseInt(userInfo.registered.unixtime) * 1000);
            } else if (userInfo.registered['#text']) {
                // Fallback to parsing the text content
                regDate = new Date(userInfo.registered['#text']);
            }
            
            if (regDate && !isNaN(regDate.getTime())) {
                const formattedDate = regDate.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long' 
                });
                document.getElementById('user-registered').textContent = formattedDate;
            } else {
                document.getElementById('user-registered').textContent = 'Unknown';
            }
        } else {
            document.getElementById('user-registered').textContent = 'Unknown';
        }
        
        // Set background image from last album artwork
        this.updateHeaderBackground();
    }

    updateHeaderBackground() {
        const userHeader = document.getElementById('user-header');
        
        if (this.currentUser && this.currentUser.lastAlbumArt) {
            // Use the album artwork as background - larger and more prominent
            userHeader.style.backgroundImage = "url('" + this.currentUser.lastAlbumArt + "')";
            userHeader.style.backgroundSize = 'auto 120%'; // Make it larger than the container
            userHeader.style.backgroundRepeat = 'no-repeat';
            userHeader.style.backgroundPosition = 'right center';
        } else {
            // Fallback to default background
            userHeader.style.backgroundImage = "url('https://www.russ.fm/images/sticker-clear.svg')";
            userHeader.style.backgroundSize = 'contain';
            userHeader.style.backgroundRepeat = 'no-repeat';
            userHeader.style.backgroundPosition = 'bottom right';
        }
    }

    async refreshAlbumArtwork() {
        if (!this.currentUser) {
            this.showStatus('error', 'Please log in to refresh artwork');
            return;
        }
        
        try {
            this.showStatus('loading', 'Refreshing album artwork...');
            
            const response = await fetch('/api/auth/refresh-artwork', { method: 'POST' });
            const data = await response.json();
            
            if (response.ok && data.success) {
                // Update the user object with new artwork
                this.currentUser.lastAlbumArt = data.lastAlbumArt || null;
                
                // Update the background
                this.updateHeaderBackground();
                
                this.showStatus('success', 'Album artwork updated!');
            } else {
                this.showStatus('error', data.error || 'Failed to refresh artwork');
            }
        } catch (error) {
            console.error('Failed to refresh artwork:', error);
            this.showStatus('error', 'Failed to refresh artwork');
        }
    }
    
    async fetchExampleSearches() {
        try {
            const response = await fetch('/api/config/example-searches');
            if (response.ok) {
                this.exampleSearches = await response.json();
                console.log('Loaded example searches:', this.exampleSearches.length);
            } else {
                console.error('Failed to load example searches');
                this.exampleSearches = [];
            }
        } catch (error) {
            console.error('Error loading example searches:', error);
            this.exampleSearches = [];
        }
    }
    
    getRandomExampleSearch() {
        if (!this.exampleSearches || this.exampleSearches.length === 0) {
            return null;
        }
        const randomIndex = Math.floor(Math.random() * this.exampleSearches.length);
        return this.exampleSearches[randomIndex];
    }

    async login() {
        try {
            const response = await fetch('/api/auth/login', { method: 'POST' });
            const data = await response.json();
            
            if (data.authUrl) {
                window.location.href = data.authUrl;
            } else {
                this.showStatus('error', 'Failed to initiate login');
            }
        } catch (error) {
            console.error('Login failed:', error);
            this.showStatus('error', 'Login failed');
        }
    }

    async logout() {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            this.currentUser = null;
            this.updateUserStatus(false);
            this.showStatus('success', 'Logged out successfully');
        } catch (error) {
            console.error('Logout failed:', error);
            this.showStatus('error', 'Logout failed');
        }
    }

    parseDiscogsInput(input) {
        // Remove whitespace
        input = input.trim();
        
        // Check for full Discogs URL
        const urlMatch = input.match(/https?:\\/\\/(?:www\\.)?discogs\\.com\\/release\\/(\\d+)/);
        if (urlMatch) {
            return urlMatch[1];
        }
        
        // Check for [r123456] format
        const bracketMatch = input.match(/^\\[r(\\d+)\\]$/);
        if (bracketMatch) {
            return bracketMatch[1];
        }
        
        // Check for r123456 format
        const rMatch = input.match(/^r(\\d+)$/);
        if (rMatch) {
            return rMatch[1];
        }
        
        // Check for plain number
        const numberMatch = input.match(/^\\d+$/);
        if (numberMatch) {
            return input;
        }
        
        return null;
    }

    async performDiscogsSearch() {
        const input = document.getElementById('release-id').value.trim();
        const searchBtn = document.getElementById('discogs-search-btn');
        
        if (!input) {
            if (this.currentDiscogsSuggestion) {
                // User clicked search again with empty input after seeing a suggestion
                document.getElementById('release-id').value = this.currentDiscogsSuggestion.discogs_release_id;
                const releaseId = this.currentDiscogsSuggestion.discogs_release_id.toString();
                this.currentDiscogsSuggestion = null; // Clear suggestion since we're using it
                
                // Continue with the search using the suggested release ID
                try {
                    this.setButtonLoading(searchBtn, 'Loading');
                    this.showStatus('loading', 'Searching Discogs database...');
                    
                    const response = await fetch("/api/search/discogs/release/" + releaseId);
                    const data = await response.json();
                    
                    if (response.ok) {
                        this.selectedAlbum = data;
                        this.displayFullAlbumPage();
                        
                        window.history.pushState({albumData: data}, data.title, "/albums/" + releaseId + "/");
                        document.title = data.title + " - RUSS FM SCROBBLER";
                    } else {
                        this.showStatus('error', data.error || 'Album not found');
                    }
                } catch (error) {
                    console.error('Failed to load album:', error);
                    this.showStatus('error', 'Failed to load album');
                } finally {
                    this.setButtonNormal(searchBtn, '<span class="discogs-logo-white me-2"></span>Search Discogs');
                }
                return;
            } else {
                // First click with empty input - show a suggestion
                const randomExample = this.getRandomExampleSearch();
                if (randomExample) {
                    this.currentDiscogsSuggestion = randomExample;
                    this.showStatus('warning', 'Please enter a Discogs release ID or URL, or search again for: "' + randomExample.album_name + '" by ' + randomExample.artist_name + ' (Release ID: ' + randomExample.discogs_release_id + ')');
                } else {
                    this.showStatus('error', 'Please enter a Discogs release ID or URL');
                }
                return;
            }
        } else {
            // User entered something, clear any suggestion
            this.currentDiscogsSuggestion = null;
        }
        
        // Parse the input to extract release ID
        const releaseId = this.parseDiscogsInput(input);
        if (!releaseId) {
            this.showStatus('error', 'Invalid Discogs format. Please use a URL, [r123456], r123456, or just the ID (123456)');
            return;
        }
        
        try {
            this.setButtonLoading(searchBtn, 'Loading');
            this.showStatus('loading', 'Searching Discogs database...');

            const response = await fetch(\`/api/search/discogs/release/\${releaseId}\`);
            const data = await response.json();

            if (response.ok) {
                this.selectedAlbum = data;
                this.displayFullAlbumPage();
                
                // Update URL to use just the release ID
                window.history.pushState({albumData: data}, data.title, \`/albums/\${releaseId}/\`);
                document.title = \`\${data.title} - RUSS FM SCROBBLER\`;
                
                // Don't call showStatus here since displayFullAlbumPage() replaced the container
            } else {
                this.showStatus('error', data.error || 'Album not found');
            }
        } catch (error) {
            console.error('Failed to load album:', error);
            this.showStatus('error', 'Failed to load album');
        } finally {
            this.setButtonNormal(searchBtn, '<span class="discogs-logo-white me-2"></span>Search Discogs');
        }
    }

    async performAlbumSearch(page = 1) {
        const album = document.getElementById('album-name').value.trim();
        const searchBtn = document.getElementById('album-search-btn');
        
        if (!album) {
            if (this.currentAlbumSuggestion) {
                // User clicked search again with empty input after seeing a suggestion
                document.getElementById('album-name').value = this.currentAlbumSuggestion.album_name;
                const albumName = this.currentAlbumSuggestion.album_name;
                this.currentAlbumSuggestion = null; // Clear suggestion since we're using it
                
                // Continue with the search using the suggested album name
                try {
                    this.setButtonLoading(searchBtn, 'Searching');
                    this.showStatus('loading', 'Searching Last.fm database...');
                    
                    const searchParams = {
                        album: albumName,
                        page: page
                    };
                    
                    const queryString = new URLSearchParams(searchParams).toString();
                    const response = await fetch("/api/search/lastfm?" + queryString);
                    const data = await response.json();
                    
                    if (response.ok) {
                        this.searchResults = data.results || [];
                        this.currentPage = (data.pagination && data.pagination.page) || 1;
                        this.totalPages = (data.pagination && data.pagination.pages) || 1;
                        
                        this.displaySearchResults();
                        this.showStatus('success', "Found " + this.searchResults.length + " results");
                    } else {
                        this.showStatus('error', data.error || 'Search failed');
                    }
                } catch (error) {
                    console.error('Search failed:', error);
                    this.showStatus('error', 'Search failed');
                } finally {
                    this.setButtonNormal(searchBtn, '<span class="lastfm-logo-white me-2"></span>Search Albums');
                }
                return;
            } else {
                // First click with empty input - show a suggestion
                const randomExample = this.getRandomExampleSearch();
                if (randomExample) {
                    this.currentAlbumSuggestion = randomExample;
                    this.showStatus('warning', 'Please enter an album name, or search again for: "' + randomExample.album_name + '" by ' + randomExample.artist_name);
                } else {
                    this.showStatus('error', 'Please enter an album name');
                }
                return;
            }
        } else {
            // User entered something, clear any suggestion
            this.currentAlbumSuggestion = null;
        }

        const searchParams = {
            album: album,
            page: page
        };

        try {
            this.setButtonLoading(searchBtn, 'Searching');
            this.showStatus('loading', 'Searching Last.fm database...');

            const queryString = new URLSearchParams(searchParams).toString();
            const response = await fetch(\`/api/search/lastfm?\${queryString}\`);
            const data = await response.json();

            if (response.ok) {
                this.searchResults = data.results || [];
                this.currentPage = (data.pagination && data.pagination.page) || 1;
                this.totalPages = (data.pagination && data.pagination.pages) || 1;
                
                this.displaySearchResults();
                this.showStatus('success', \`Found \${this.searchResults.length} results\`);
            } else {
                this.showStatus('error', data.error || 'Search failed');
            }
        } catch (error) {
            console.error('Search failed:', error);
            this.showStatus('error', 'Search failed');
        } finally {
            this.setButtonNormal(searchBtn, '<span class="lastfm-logo-white me-2"></span>Search Albums');
        }
    }

    displaySearchResults() {
        const resultsSection = document.getElementById('results-section');
        const resultsContainer = document.getElementById('results-container');
        const pagination = document.getElementById('pagination');

        if (this.searchResults.length === 0) {
            resultsSection.classList.add('d-none');
            return;
        }

        resultsSection.classList.remove('d-none');

        // Clear previous results
        resultsContainer.innerHTML = '';

        this.searchResults.forEach((result, index) => {
            const colDiv = document.createElement('div');
            colDiv.className = 'col';

            const cardDiv = document.createElement('div');
            cardDiv.className = 'card h-100 album-card';

            // Use high-resolution image if available, fallback to thumb
            const imageUrl = result.cover_image || result.thumb || '';
            const hasImage = imageUrl && imageUrl !== '';

            cardDiv.innerHTML = \`
                \${hasImage ? 
                    \`<img src="\${imageUrl}" class="card-img-top" alt="\${result.title}" loading="lazy">\` : 
                    '<div class="card-img-top bg-light d-flex align-items-center justify-content-center text-muted" style="height: 200px;"><i class="bi bi-music-note" style="font-size: 3rem;"></i></div>'
                }
                <div class="card-body">
                    <h5 class="card-title">
                        <a class="stretched-link text-dark text-decoration-none" href="#" data-album-id="\${result.id}">
                            \${result.title}
                        </a>
                    </h5>
                    <p class="card-subtitle text-muted mb-2">
                        by \${result.artist || 'Various Artists'}
                    </p>
                    \${result.genre ? \`
                        <div class="mb-2">
                            \${result.genre.map(genre => \`<span class="badge rounded-pill text-bg-primary text-light me-1">\${genre}</span>\`).join('')}
                        </div>
                    \` : ''}
                    \${result.style ? \`
                        <div class="mb-2">
                            \${result.style.map(style => \`<span class="badge rounded-pill text-bg-secondary text-light me-1">\${style}</span>\`).join('')}
                        </div>
                    \` : ''}
                </div>
                <div class="card-footer">
                    <small class="text-muted">
                        \${result.year || 'Unknown Year'}
                        \${result.format ? \` • \${result.format.join(', ')}\` : ''}
                    </small>
                </div>
            \`;

            // Add click event to the card
            cardDiv.addEventListener('click', (e) => {
                e.preventDefault();
                this.selectAlbum(result);
            });

            colDiv.appendChild(cardDiv);
            resultsContainer.appendChild(colDiv);
        });

        // Create pagination
        this.createPagination(pagination);
    }

    createPagination(container) {
        container.innerHTML = '';

        if (this.totalPages <= 1) return;

        const paginationUl = document.createElement('ul');
        paginationUl.className = 'pagination';

        // Previous button
        if (this.currentPage > 1) {
            const prevLi = document.createElement('li');
            prevLi.className = 'page-item';
            prevLi.innerHTML = \`<a class="page-link" href="#" aria-label="Previous"><span aria-hidden="true">&laquo;</span></a>\`;
            prevLi.addEventListener('click', (e) => {
                e.preventDefault();
                this.performAlbumSearch(this.currentPage - 1);
            });
            paginationUl.appendChild(prevLi);
        }

        // Page numbers
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(this.totalPages, this.currentPage + 2);

        for (let i = startPage; i <= endPage; i++) {
            const pageLi = document.createElement('li');
            pageLi.className = i === this.currentPage ? 'page-item active' : 'page-item';
            pageLi.innerHTML = \`<a class="page-link" href="#">\${i}</a>\`;
            pageLi.addEventListener('click', (e) => {
                e.preventDefault();
                this.performAlbumSearch(i);
            });
            paginationUl.appendChild(pageLi);
        }

        // Next button
        if (this.currentPage < this.totalPages) {
            const nextLi = document.createElement('li');
            nextLi.className = 'page-item';
            nextLi.innerHTML = \`<a class="page-link" href="#" aria-label="Next"><span aria-hidden="true">&raquo;</span></a>\`;
            nextLi.addEventListener('click', (e) => {
                e.preventDefault();
                this.performAlbumSearch(this.currentPage + 1);
            });
            paginationUl.appendChild(nextLi);
        }

        container.appendChild(paginationUl);
    }

    async selectAlbum(albumData) {
        try {
            this.showStatus('loading', 'Loading album details...');

            // Check if this is a Last.fm result (ID starts with 'lastfm-')
            if (String(albumData.id).startsWith('lastfm-')) {
                // For Last.fm albums, get detailed info from Last.fm API
                const response = await fetch(\`/api/search/lastfm/album?artist=\${encodeURIComponent(albumData.artist)}&album=\${encodeURIComponent(albumData.title)}\`);
                const data = await response.json();

                if (response.ok) {
                    this.selectedAlbum = data;
                    this.displayFullAlbumPage();
                    
                    // Update URL for Last.fm albums
                    const albumSlug = \`\${albumData.artist}-\${albumData.title}\`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                    window.history.pushState({albumData: data}, data.title, \`/albums/lastfm/\${albumSlug}/\`);
                    document.title = \`\${data.title} - RUSS FM SCROBBLER\`;
                    
                    // Don't call showStatus here since displayFullAlbumPage() replaced the container
                } else {
                    this.showStatus('error', data.error || 'Failed to load album details');
                }
            } else {
                // For Discogs albums, use existing logic
                const response = await fetch(\`/api/search/discogs/release/\${albumData.id}\`);
                const data = await response.json();

                if (response.ok) {
                    this.selectedAlbum = data;
                    this.displayFullAlbumPage();
                    
                    // Update URL to use just the release ID
                    window.history.pushState({albumData: data}, data.title, \`/albums/\${albumData.id}/\`);
                    document.title = \`\${data.title} - RUSS FM SCROBBLER\`;
                    
                    // Don't call showStatus here since displayFullAlbumPage() replaced the container
                } else {
                    this.showStatus('error', data.error || 'Failed to load album details');
                }
            }
        } catch (error) {
            console.error('Failed to load album:', error);
            this.showStatus('error', 'Failed to load album details');
        }
    }

    createAlbumSlug(title, id) {
        // No longer needed - keeping for backward compatibility
        return id;
    }

    displayFullAlbumPage() {
        console.log('displayFullAlbumPage called with album:', this.selectedAlbum);
        
        // Hide search sections and show full album page
        const resultsSection = document.getElementById('results-section');
        if (resultsSection) {
            resultsSection.classList.add('d-none');
            console.log('Hidden results section');
        }
        
        // Hide the search card and jumbotron when showing full album page
        const searchCards = document.querySelectorAll('.card');
        const jumbotron = document.querySelector('.jumbotron-background');
        
        // Hide all existing cards (search form, results, etc.)
        searchCards.forEach(card => {
            card.classList.add('d-none');
        });
        console.log('Hidden search cards');
        
        if (jumbotron) {
            jumbotron.classList.add('d-none');
            console.log('Hidden jumbotron');
        }
        
        const container = document.querySelector('.container.my-5');
        if (!container) {
            console.error('Could not find .container.my-5 element');
            return;
        }
        
        console.log('About to replace container innerHTML');
        
        // Create a new album page container
        const albumPageHTML = \`
            <div class="album-page-container">
                <!-- Breadcrumbs -->
                <nav aria-label="breadcrumb" class="breadcrumb-nav">
                    <div class="container">
                        <ol class="breadcrumb">
                            <li class="breadcrumb-item"><a href="/">Search</a></li>
                            <li class="breadcrumb-item artist-name">\${this.selectedAlbum.artists ? this.selectedAlbum.artists[0].name : 'Unknown Artist'}</li>
                            <li class="breadcrumb-item active" aria-current="page">\${this.selectedAlbum.title}</li>
                        </ol>
                        <div class="data-source">Data source: \${this.selectedAlbum.id && String(this.selectedAlbum.id).startsWith('lastfm-') ? '<span class="lastfm-logo me-1"></span>Last.fm' : '<span class="discogs-logo me-1"></span>Discogs'}</div>
                    </div>
                </nav>

                <div class="container album-content">
                    <div class="row">
                        <!-- Left Column: Album Info -->
                        <div class="col-lg-4 col-md-5">
                            <div class="album-info-card">
                                <!-- Album Cover -->
                                <img src="\${this.selectedAlbum.images && this.selectedAlbum.images[0] ? this.selectedAlbum.images[0].uri : '/placeholder-album.jpg'}" 
                                     alt="\${this.selectedAlbum.title}" 
                                     class="album-cover">
                                
                                <!-- Album Details -->
                                <div class="album-details">
                                    <h1 class="album-title">\${this.selectedAlbum.title}</h1>
                                    <h2 class="artist-name">\${this.selectedAlbum.artists ? this.selectedAlbum.artists[0].name : 'Unknown Artist'}</h2>
                                    <div class="album-year">\${this.selectedAlbum.year || 'Unknown'}</div>
                                    \${this.selectedAlbum.formats ? \`<div class="album-format">\${this.selectedAlbum.formats.map(f => f.name).join(', ')}</div>\` : ''}
                                </div>

                                <!-- Scrobble Buttons -->
                                <div class="scrobble-actions">
                                    <button id="scrobble-album-btn" class="btn btn-success btn-lg w-100 mb-3">
                                        <span class="lastfm-logo-white me-2"></span>
                                        Scrobble album
                                    </button>
                                    
                                    \${this.selectedAlbum.id && !String(this.selectedAlbum.id).startsWith('lastfm-') ? \`
                                        <a href="https://www.discogs.com/release/\${this.selectedAlbum.id}" target="_blank" class="btn btn-outline-secondary btn-lg w-100 mb-3">
                                            <span class="discogs-logo me-2"></span>
                                            View on Discogs
                                        </a>
                                    \` : ''}
                                    
                                    <!-- Status Messages -->
                                    <div id="album-status" class="d-none"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Right Column: Track List -->
                        <div class="col-lg-8 col-md-7">

                            \${this.selectedAlbum.tracklist && this.selectedAlbum.tracklist.length > 0 ? \`
                                <div class="track-list-container">
                                    \${this.selectedAlbum.tracklist.map((track, index) => {
                                        if (track.type_ === 'track') {
                                            return \`
                                                <div class="track-row">
                                                    <div class="track-info">
                                                        <span class="track-number">\${track.position || (index + 1)}</span>
                                                        <span class="track-title">\${track.title}</span>
                                                        \${track.duration ? \`<span class="track-duration">\${track.duration}</span>\` : ''}
                                                    </div>
                                                    <button class="btn btn-success btn-sm track-scrobble-btn" onclick="app.scrobbleTrack(\${index})">
                                                        Scrobble
                                                    </button>
                                                </div>
                                            \`;
                                        }
                                        return '';
                                    }).join('')}
                                </div>
                            \` : ''}
                        </div>
                    </div>

                    <!-- Back Button -->
                    <div class="back-button-container">
                        <button id="back-to-search" class="btn btn-secondary">
                            <i class="bi bi-arrow-left me-1"></i>
                            Back to Search
                        </button>
                    </div>
                </div>
            </div>
        \`;
        
        // Replace the container content
        container.innerHTML = albumPageHTML;
        console.log('Container innerHTML replaced successfully');

        // Bind events for the new page
        const scrobbleBtn = document.getElementById('scrobble-album-btn');
        const backBtn = document.getElementById('back-to-search');
        
        if (scrobbleBtn) {
            scrobbleBtn.addEventListener('click', () => this.scrobbleAlbum());
            console.log('Bound scrobble button event');
        }
        
        if (backBtn) {
            backBtn.addEventListener('click', () => this.backToSearch());
            console.log('Bound back button event');
        }

        // Scroll to top
        window.scrollTo(0, 0);
        console.log('displayFullAlbumPage completed successfully');
    }

    backToSearch() {
        // Update URL to home page
        window.history.pushState({}, 'RUSS FM SCROBBLER', '/');
        
        // Restore original page content
        location.reload();
    }

    async scrobbleTrack(trackIndex) {
        if (!this.currentUser) {
            this.showAlbumStatus('error', 'Please log in to Last.fm first');
            return;
        }

        const track = this.selectedAlbum.tracklist[trackIndex];
        if (!track || track.type_ !== 'track') return;

        // Find the track button
        const trackButtons = document.querySelectorAll('.track-scrobble-btn');
        const trackButton = trackButtons[trackIndex];

        try {
            if (trackButton) {
                this.setButtonLoading(trackButton, 'Scrobbling');
            }
            this.showAlbumStatus('loading', \`Scrobbling "\${track.title}"...\`);

            const scrobbleData = {
                artist: this.selectedAlbum.artists ? this.selectedAlbum.artists[0].name : 'Unknown Artist',
                track: track.title,
                album: this.selectedAlbum.title,
                timestamp: Math.floor(Date.now() / 1000)
            };

            const response = await fetch('/api/scrobble/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(scrobbleData)
            });

            const data = await response.json();

            if (response.ok) {
                this.showAlbumStatus('success', \`✓ Successfully scrobbled "\${track.title}"\`);
                if (trackButton) {
                    this.setButtonSuccess(trackButton, '✓ Scrobbled');
                    setTimeout(() => {
                        this.setButtonNormal(trackButton, 'Scrobble');
                    }, 2000);
                }
            } else {
                this.showAlbumStatus('error', data.error || 'Scrobble failed');
                if (trackButton) {
                    this.setButtonNormal(trackButton, 'Scrobble');
                }
            }
        } catch (error) {
            console.error('Scrobble failed:', error);
            this.showAlbumStatus('error', 'Scrobble failed');
            if (trackButton) {
                this.setButtonNormal(trackButton, 'Scrobble');
            }
        }
    }

    async scrobbleAlbum() {
        if (!this.currentUser) {
            this.showAlbumStatus('error', 'Please log in to Last.fm first');
            return;
        }

        if (!this.selectedAlbum || !this.selectedAlbum.tracklist) {
            this.showAlbumStatus('error', 'No album selected');
            return;
        }

        const tracks = this.selectedAlbum.tracklist.filter(track => track.type_ === 'track');
        if (tracks.length === 0) {
            this.showAlbumStatus('error', 'No tracks found in album');
            return;
        }

        const scrobbleBtn = document.getElementById('scrobble-album-btn');
        
        try {
            this.setButtonLoading(scrobbleBtn, 'Scrobbling');
            this.showAlbumStatus('loading', \`Preparing to scrobble \${tracks.length} tracks from "\${this.selectedAlbum.title}"...\`);

            const albumData = {
                artist: this.selectedAlbum.artists ? this.selectedAlbum.artists[0].name : 'Unknown Artist',
                album: this.selectedAlbum.title,
                tracks: tracks.map(track => ({
                    title: track.title,
                    duration: track.duration
                }))
            };

            const response = await fetch('/api/scrobble/album', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(albumData)
            });

            const data = await response.json();

            if (response.ok) {
                this.showAlbumStatus('success', \`🎵 Successfully scrobbled all \${tracks.length} tracks from "\${this.selectedAlbum.title}"!\`);
                this.setButtonSuccess(scrobbleBtn, '✓ Album Scrobbled');
                
                // Reset button after 3 seconds
                setTimeout(() => {
                    this.setButtonNormal(scrobbleBtn, '<span class="lastfm-logo-white me-2"></span>Scrobble album');
                }, 3000);
            } else {
                this.showAlbumStatus('error', data.error || 'Album scrobble failed');
                this.setButtonNormal(scrobbleBtn, '<span class="lastfm-logo-white me-2"></span>Scrobble album');
            }
        } catch (error) {
            console.error('Album scrobble failed:', error);
            this.showAlbumStatus('error', 'Album scrobble failed');
            this.setButtonNormal(scrobbleBtn, '<span class="lastfm-logo-white me-2"></span>Scrobble album');
        }
    }

    clearSelection() {
        this.selectedAlbum = null;
        document.getElementById('album-section').classList.add('d-none');
        this.showStatus('success', 'Selection cleared');
    }

    showStatus(type, message) {
        const statusElement = document.getElementById('search-status');
        statusElement.innerHTML = \`<div class="alert \${this.getStatusClasses(type)} mb-0">\${message}</div>\`;
        statusElement.classList.remove('d-none');
    }

    showAlbumStatus(type, message) {
        const statusElement = document.getElementById('album-status');
        if (statusElement) {
            statusElement.innerHTML = \`<div class="alert \${this.getStatusClasses(type)} mb-0">\${message}</div>\`;
            statusElement.classList.remove('d-none');
        }
    }

    getStatusClasses(type) {
        switch(type) {
            case 'success':
                return 'alert-success';
            case 'error':
                return 'alert-danger';
            case 'warning':
                return 'alert-warning';
            case 'loading':
                return 'alert-info';
            default:
                return 'alert-secondary';
        }
    }

    // Button state management helpers
    setButtonLoading(button, text = 'Loading') {
        if (!button) return;
        
        button.disabled = true;
        button.classList.add('loading');
        
        // Store original content
        if (!button.dataset.originalContent) {
            button.dataset.originalContent = button.innerHTML;
        }
        
        button.innerHTML = \`\${text}<span class="loading-dots"></span>\`;
    }

    setButtonNormal(button, content = null) {
        if (!button) return;
        
        button.disabled = false;
        button.classList.remove('loading', 'btn-success-temp');
        
        // Restore original content or use provided content
        if (content) {
            button.innerHTML = content;
        } else if (button.dataset.originalContent) {
            button.innerHTML = button.dataset.originalContent;
        }
    }

    setButtonSuccess(button, text = 'Success') {
        if (!button) return;
        
        button.disabled = false;
        button.classList.remove('loading');
        button.classList.add('btn-success-temp');
        button.innerHTML = \`<span class="btn-text">\${text}</span>\`;
    }

    handleDirectAlbumURL() {
        // Check if we're on a direct album URL like /albums/34201738/
        const path = window.location.pathname;
        console.log('handleDirectAlbumURL - Current path:', path);
        
        // Use string methods to parse the URL
        if (path.includes('/albums/')) {
            const pathParts = path.split('/').filter(part => part.length > 0);
            console.log('Path parts:', pathParts);
            
            const albumIndex = pathParts.indexOf('albums');
            if (albumIndex !== -1 && albumIndex < pathParts.length - 1) {
                const releaseId = pathParts[albumIndex + 1];
                console.log('Extracted release ID:', releaseId);
                
                // Check if it's a valid number
                if (releaseId && !isNaN(releaseId)) {
                    console.log('Valid release ID found:', releaseId);
                    this.loadAlbumDirectly(releaseId);
                    return;
                }
            }
        }
        console.log('No album URL match found');
    }

    async loadAlbumDirectly(releaseId) {
        try {
            console.log('Loading album directly for release ID:', releaseId);
            this.showStatus('loading', 'Loading album from Discogs...');

            // Get detailed album information directly
            const response = await fetch(\`/api/search/discogs/release/\${releaseId}\`);
            console.log('API response status:', response.status);
            const data = await response.json();
            console.log('API response data:', data);

            if (response.ok) {
                this.selectedAlbum = data;
                console.log('About to display full album page');
                this.displayFullAlbumPage();
                document.title = \`\${data.title} - RUSS FM SCROBBLER\`;
                console.log('Album page should be displayed');
            } else {
                console.error('API error:', data.error);
                this.showStatus('error', data.error || 'Album not found');
                // Redirect to home page after a delay
                setTimeout(() => {
                    window.location.href = '/';
                }, 3000);
            }
        } catch (error) {
            console.error('Failed to load album directly:', error);
            this.showStatus('error', 'Failed to load album');
            // Redirect to home page after a delay
            setTimeout(() => {
                window.location.href = '/';
            }, 3000);
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    console.log('Current URL:', window.location.href);
    console.log('Current pathname:', window.location.pathname);
    
    // Handle auth callback first
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('token')) {
        // This is an auth callback, handle it
        fetch('/api/auth/callback' + window.location.search, { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Remove token from URL and reload
                    window.history.replaceState({}, document.title, window.location.pathname);
                    window.location.reload();
                } else {
                    alert('Authentication failed: ' + (data.error || 'Unknown error'));
                }
            })
            .catch(error => {
                console.error('Auth callback failed:', error);
                alert('Authentication failed');
            });
    } else {
        // No auth callback, initialize the app normally
        window.app = new ScrobblerApp();
    }
});`;