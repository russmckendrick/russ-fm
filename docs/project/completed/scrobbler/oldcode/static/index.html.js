export const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>russFM [Scrobbler]</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
    <link rel="stylesheet" href="/styles.css">
</head>
<body class="d-flex flex-column min-vh-100">
    <!-- Header -->
    <header class="main-header">
        <nav class="navbar navbar-expand-lg fixed-top">
            <div class="container">
                <!-- Brand -->
                <a class="navbar-brand" href="/">
                    <img src="https://www.russ.fm/images/record.svg" alt="logo" width="30" height="24" class="d-inline-block align-text-top navbar-icon me-2">
                    russFM
                </a>

                <!-- Menu Toggler -->
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon"></span>
                </button>

                <!-- Main Menu -->
                <div class="collapse navbar-collapse" id="navbarSupportedContent">
                    <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                        <li class="nav-item">
                            <a class="nav-link active" aria-current="page" href="/">Scrobbler</a>
                        </li>
                    </ul>

                    <!-- Auth Section -->
                    <div class="d-flex align-items-center gap-3">
                        <span id="user-info" class="text-light small">Not logged in</span>
                        <button id="login-btn" class="btn btn-secondary btn-sm">
                            <span class="lastfm-logo-white me-2"></span>
                            Login to Last.fm
                        </button>
                        <button id="logout-btn" class="btn btn-outline-light btn-sm d-none">
                            <i class="bi bi-box-arrow-right me-1"></i>
                            Logout
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    </header>

    <!-- Main Content -->
    <div id="content" class="flex-fill">
        <div class="container my-5">
            <!-- Jumbotron Header - Default (Not Logged In) -->
            <div id="default-header" class="bg-primary text-light rounded-3 d-flex flex-column-reverse flex-md-column flex-lg-row align-items-center jumbotron-background mb-5">
                <div class="text-container p-5">
                    <h1 class="display-4">Music Scrobbler</h1>
                    <p class="lead">Search for albums on Discogs and scrobble them to Last.fm</p>
                </div>
            </div>

            <!-- User Account Header - Logged In -->
            <div id="user-header" class="bg-primary text-light rounded-3 d-flex flex-column-reverse flex-md-column flex-lg-row align-items-center jumbotron-background mb-5 d-none">
                <div class="text-container p-5">
                    <div class="d-flex align-items-center mb-3">
                        <img id="user-avatar" src="" alt="User Avatar" class="user-avatar rounded-circle me-3" width="60" height="60" style="border: 2px solid rgba(255,255,255,0.3);">
                        <div class="flex-grow-1">
                            <div class="d-flex align-items-center mb-1">
                                <h1 class="display-6 mb-0 me-2">Welcome back, <span id="user-display-name"></span>!</h1>
                                <span id="user-pro-badge" class="badge pro-badge d-none">
                                    <i class="bi bi-star-fill me-1"></i>PRO
                                </span>
                            </div>
                            <p class="mb-0 user-stats">
                                <i class="bi bi-music-note me-1"></i>
                                <span id="user-playcount"></span> scrobbles
                                <span class="mx-2">•</span>
                                <i class="bi bi-calendar me-1"></i>
                                Member since <span id="user-registered"></span>
                            </p>
                        </div>
                    </div>
                    <p class="lead mb-0">Ready to discover and scrobble more music?</p>
                </div>
                <button id="refresh-artwork-btn" class="refresh-artwork-btn" title="Refresh album artwork from latest scrobble">
                    <i class="bi bi-arrow-clockwise"></i>
                </button>
            </div>

            <!-- Search Section -->
            <div class="card mb-4">
                <div class="card-body">
                    <h2 class="card-title h4 mb-4">
                        <i class="bi bi-search me-2"></i>
                        Search for Music
                    </h2>
                    
                    <div class="row">
                        <div class="col-md-6">
                            <!-- Discogs Release Search -->
                            <div class="mb-3">
                                <label for="release-id" class="form-label fw-bold d-flex align-items-center">
                                    <span class="discogs-logo me-2"></span>
                                    Discogs Release
                                </label>
                                <input type="text" id="release-id" class="form-control" 
                                       placeholder="Enter Discogs URL, [r123456], r123456, or 123456">
                                <div class="form-text">
                                    Supports: Full URLs, [r123456], r123456, or just the ID (123456)
                                </div>
                            </div>
                            <button id="discogs-search-btn" class="btn btn-primary w-100 mb-3">
                                <span class="discogs-logo-white me-2"></span>
                                Search Discogs
                            </button>
                        </div>
                        
                        <div class="col-md-6">
                            <!-- Album Name Search -->
                            <div class="mb-3">
                                <label for="album-name" class="form-label fw-bold d-flex align-items-center">
                                    <span class="lastfm-logo me-2"></span>
                                    Album Name
                                </label>
                                <input type="text" id="album-name" class="form-control" 
                                       placeholder="Enter album name to search">
                                <div class="form-text">
                                    Search for albums by name using Last.fm
                                </div>
                            </div>
                            <button id="album-search-btn" class="btn btn-secondary w-100 mb-3">
                                <span class="lastfm-logo-white me-2"></span>
                                Search Albums
                            </button>
                        </div>
                    </div>

                    <!-- Status Message -->
                    <div id="search-status" class="mt-3 d-none"></div>
                </div>
            </div>

            <!-- Results Section -->
            <div id="results-section" class="card mb-4 d-none">
                <div class="card-body">
                    <h2 class="card-title h4 mb-4">
                        <i class="bi bi-collection me-2"></i>
                        Search Results
                    </h2>
                    <div id="results-container" class="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4"></div>
                    <nav aria-label="Search results pagination" class="mt-4">
                        <div id="pagination" class="d-flex justify-content-center"></div>
                    </nav>
                </div>
            </div>

            <!-- Album Details Section -->
            <div id="album-section" class="card mb-4 d-none">
                <div class="card-body">
                    <h2 class="card-title h4 mb-4">
                        <i class="bi bi-vinyl me-2"></i>
                        Selected Album
                    </h2>
                    <div id="album-details" class="row mb-4"></div>
                    <div id="track-list" class="mb-4"></div>
                    <div class="d-flex gap-2 flex-wrap justify-content-center">
                        <button id="scrobble-all-btn" class="btn btn-primary btn-lg">
                            <span class="lastfm-logo-white me-2"></span>
                            Scrobble Entire Album
                        </button>
                        <button id="clear-selection-btn" class="btn btn-secondary">
                            <i class="bi bi-x-circle me-1"></i>
                            Clear Selection
                        </button>
                    </div>
                    <div id="scrobble-status" class="mt-3 d-none"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Footer -->
    <footer class="bg-dark text-light py-4 mt-auto">
        <div class="container text-center">
            <p class="mb-2">
                <a href="https://www.discogs.com/developers" target="_blank" class="footer-api-link d-inline-flex align-items-center">
                    <span class="discogs-logo-white me-1"></span>
                    Discogs API
                </a> | 
                <a href="https://www.last.fm/api" target="_blank" class="footer-api-link d-inline-flex align-items-center">
                    <span class="lastfm-logo-white me-1"></span>
                    Last.fm API
                </a> | 
                <a href="https://github.com/russmckendrick/russ-fm-scrobbler" target="_blank" class="footer-source-link">
                    <i class="bi bi-github me-1"></i>
                    Source Code
                </a> | 
                <a href="https://www.russ.fm/" target="_blank" class="footer-site-link">
                    <i class="bi bi-globe me-1"></i>
                    russFM
                </a>
            </p>
        </div>
    </footer>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="/script.js"></script>
</body>
</html>`