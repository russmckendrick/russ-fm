export const EMBED_HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>russFM Scrobbler - Embed</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
    <link rel="stylesheet" href="/styles.css">
    <style>
        body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
        }
        .embed-card {
            background: white;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            max-width: 400px;
            width: 100%;
            overflow: hidden;
        }
        .embed-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            text-align: center;
        }
        .embed-body {
            padding: 30px;
            text-align: center;
        }
        .album-cover {
            width: 120px;
            height: 120px;
            object-fit: cover;
            border-radius: 10px;
            margin-bottom: 15px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .album-title {
            font-size: 1.1rem;
            font-weight: bold;
            margin-bottom: 5px;
            color: #333;
        }
        .artist-name {
            font-size: 0.9rem;
            color: #666;
            margin-bottom: 20px;
        }
        .status-message {
            margin: 20px 0;
            padding: 15px;
            border-radius: 8px;
            font-weight: 500;
        }
        .status-loading {
            background: #e3f2fd;
            color: #1976d2;
            border: 1px solid #bbdefb;
        }
        .status-success {
            background: #e8f5e8;
            color: #2e7d32;
            border: 1px solid #c8e6c9;
        }
        .status-error {
            background: #ffebee;
            color: #c62828;
            border: 1px solid #ffcdd2;
        }
        .spinner-border-sm {
            width: 1rem;
            height: 1rem;
        }
        .close-btn {
            margin-top: 15px;
        }
        .login-section {
            text-align: center;
            padding: 20px;
        }
        .login-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: none;
            color: white;
            padding: 12px 24px;
            border-radius: 25px;
            font-weight: 500;
            text-decoration: none;
            display: inline-block;
            transition: transform 0.2s;
        }
        .login-btn:hover {
            transform: translateY(-2px);
            color: white;
        }
    </style>
</head>
<body>
    <div class="embed-card">
        <div class="embed-header">
            <h5 class="mb-0">
                <img src="https://www.russ.fm/images/record.svg" alt="logo" width="24" height="24" class="me-2">
                russFM Scrobbler
            </h5>
        </div>
        
        <div class="embed-body">
            <!-- Loading State -->
            <div id="loading-state">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <div class="status-message status-loading">
                    <i class="bi bi-clock me-2"></i>
                    Initializing...
                </div>
            </div>

            <!-- Login Required State -->
            <div id="login-state" class="d-none">
                <div class="login-section">
                    <i class="bi bi-person-circle text-muted mb-3" style="font-size: 3rem;"></i>
                    <h6 class="mb-3">Login Required</h6>
                    <p class="text-muted mb-3">Please log in to Last.fm to scrobble this album.</p>
                    <a href="#" id="login-link" class="login-btn">
                        <span class="lastfm-logo-white me-2"></span>
                        Login to Last.fm
                    </a>
                </div>
            </div>

            <!-- Album Display State -->
            <div id="album-state" class="d-none">
                <img id="album-cover" src="" alt="Album Cover" class="album-cover">
                <div id="album-title" class="album-title"></div>
                <div id="artist-name" class="artist-name"></div>
                <div id="status-container"></div>
                <button id="close-btn" class="btn btn-secondary close-btn d-none">Close</button>
            </div>
        </div>
    </div>

    <script src="/embed-script.js"></script>
</body>
</html>`; 