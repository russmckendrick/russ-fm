export const CSS_CONTENT = `/* RUSS FM SCROBBLER - BOOTSTRAP THEME */

/* CSS Variables matching Hugo theme */
:root {
    --dark-navy: #1a1e2e;
    --medium-navy: #2c3141;
    --light-navy: #3d4255;
    --accent-grey: #cccccc;
    --text-light: #e0e0e0;
    --light-accent: #e0e0e0;
    --bs-primary: #1a1e2e;
    --bs-secondary: #6c757d;
    
    /* Brand Colors */
    --lastfm-red: #D51007;
    --discogs-dark: #333333;
    
    /* Brand Logo Data URIs */
    --lastfm-logo: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 112.195 112.195'%3e%3cpath fill='%23D31F27' d='M112.195,56.097c0,30.983-25.114,56.099-56.097,56.099C25.115,112.195,0,87.08,0,56.097C0,25.117,25.115,0,56.099,0C87.081,0,112.195,25.117,112.195,56.097z'/%3e%3cpath fill='%23FFFFFF' d='M80.487,52.141c-6.203-1.849-8.412-2.874-8.412-4.922c0-3.416,4.937-4.702,5.497-4.79c3.139-0.465,7.072,1.173,8.34,4.99l8.44-2.553c-2.65-8.385-10.487-12.099-18.099-10.975c-7.788,1.146-12.782,6.786-12.782,13.327c0,8.8,8.244,11.332,14.43,13.181c6.509,1.944,8.401,2.637,8.401,5.023c0,2.016-1.196,3.895-4.374,4.735c-6.32,1.664-14.586-0.672-16.887-4.523c-1.351-2.261-2.733-5.203-4.001-8.53c-3.766-9.866-8.926-23.371-23.764-23.371c-7.731,0-21.851,3.743-21.851,24.868c0,8.744,7.481,19.613,21.578,19.613c11.829,0,13.888-4.32,14.358-5.085l-3.861-7.555c-0.098,0.138-3.692,4.936-10.497,4.936c-11.107,0-12.735-11.776-12.735-11.909c0-10.967,4.687-16.238,13.008-16.238c8.094,0,11.382,7.04,15.48,17.759c1.397,3.683,2.922,6.966,4.65,9.865c3.657,6.116,11.55,8.091,19.473,8.091c2.418,0,5.2,0.137,7.351-0.432c7.093-1.878,10.905-6.178,10.905-12.224C95.137,56.218,86.852,54.044,80.487,52.141z'/%3e%3c/svg%3e");
    --discogs-logo: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23333333'%3e%3cpath d='M1.7422 11.982c0-5.6682 4.61-10.2782 10.2758-10.2782 1.8238 0 3.5372.48 5.0251 1.3175l.8135-1.4879C16.1768.588 14.2474.036 12.1908.0024h-.1944C5.4091.0144.072 5.3107 0 11.886v.1152c.0072 3.4389 1.4567 6.5345 3.7748 8.7207l1.1855-1.2814c-1.9798-1.8743-3.218-4.526-3.218-7.4585zM20.362 3.4053l-1.1543 1.2406c1.903 1.867 3.0885 4.4636 3.0885 7.3361 0 5.6658-4.61 10.2758-10.2758 10.2758-1.783 0-3.4605-.456-4.922-1.2575l-.8542 1.5214c1.7086.9384 3.6692 1.4735 5.7546 1.4759C18.6245 23.9976 24 18.6246 24 11.9988c-.0048-3.3717-1.399-6.4146-3.638-8.5935zM1.963 11.982c0 2.8701 1.2119 5.4619 3.146 7.2953l1.1808-1.2767c-1.591-1.5166-2.587-3.6524-2.587-6.0186 0-4.586 3.7293-8.3152 8.3152-8.3152 1.483 0 2.875.3912 4.082 1.0751l.8351-1.5262C15.481 2.395 13.8034 1.927 12.018 1.927 6.4746 1.9246 1.963 6.4362 1.963 11.982zm18.3702 0c0 4.586-3.7293 8.3152-8.3152 8.3152-1.4327 0-2.7837-.3648-3.962-1.0055l-.852 1.5166c1.4303.7823 3.0718 1.2287 4.814 1.2287 5.5434 0 10.055-4.5116 10.055-10.055 0-2.8077-1.1567-5.3467-3.0165-7.1729l-1.183 1.2743c1.519 1.507 2.4597 3.5924 2.4597 5.8986zm-1.9486 0c0 3.5109-2.8558 6.3642-6.3642 6.3642a6.3286 6.3286 0 01-3.0069-.756l-.8471 1.507c1.147.624 2.4597.9768 3.854.9768 4.4636 0 8.0944-3.6308 8.0944-8.0944 0-2.239-.9143-4.2692-2.3902-5.7378l-1.1783 1.267c1.1351 1.152 1.8383 2.731 1.8383 4.4732zm-14.4586 0c0 2.3014.9671 4.382 2.515 5.8578l1.1734-1.2695c-1.207-1.159-1.9606-2.786-1.9606-4.5883 0-3.5108 2.8557-6.3642 6.3642-6.3642 1.1423 0 2.215.3048 3.1437.8352l.8303-1.5167c-1.1759-.6647-2.5317-1.0487-3.974-1.0487-4.4612 0-8.092 3.6308-8.092 8.0944zm12.5292 0c0 2.4502-1.987 4.4372-4.4372 4.4372a4.4192 4.4192 0 01-2.0614-.5088l-.8351 1.4879a6.1135 6.1135 0 002.8965.727c3.3885 0 6.1434-2.7548 6.1434-6.1433 0-1.6774-.6767-3.1989-1.7686-4.3076l-1.1615 1.2503c.7559.7967 1.2239 1.8718 1.2239 3.0573zm-10.5806 0c0 1.7374.7247 3.3069 1.8886 4.4252L8.92 15.1569l.0144.0144c-.8351-.8063-1.3559-1.9366-1.3559-3.1869 0-2.4502 1.9846-4.4372 4.4372-4.4372.8087 0 1.5646.2184 2.2174.5976l.8207-1.4975a6.097 6.097 0 00-3.0381-.8063c-3.3837-.0048-6.141 2.7525-6.141 6.141zm6.681 0c0 .2952-.2424.5351-.5376.5351-.2952 0-.5375-.24-.5375-.5351 0-.2976.24-.5375.5375-.5375.2952 0 .5375.24.5375.5375zm-3.9405 0c0-1.879 1.5239-3.4029 3.4005-3.4029 1.879 0 3.4005 1.5215 3.4005 3.4029 0 1.879-1.5239 3.4005-3.4005 3.4005S8.6151 13.861 8.6151 11.982zm.1488 0c.0048 1.7974 1.4567 3.2493 3.2517 3.2517 1.795 0 3.254-1.4567 3.254-3.2517-.0023-1.7974-1.4566-3.2517-3.254-3.254-1.795 0-3.2517 1.4566-3.2517 3.254Z'/%3e%3c/svg%3e");
    --lastfm-logo-white: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 112.195 112.195'%3e%3cpath fill='%23FFFFFF' d='M112.195,56.097c0,30.983-25.114,56.099-56.097,56.099C25.115,112.195,0,87.08,0,56.097C0,25.117,25.115,0,56.099,0C87.081,0,112.195,25.117,112.195,56.097z'/%3e%3cpath fill='%23D31F27' d='M80.487,52.141c-6.203-1.849-8.412-2.874-8.412-4.922c0-3.416,4.937-4.702,5.497-4.79c3.139-0.465,7.072,1.173,8.34,4.99l8.44-2.553c-2.65-8.385-10.487-12.099-18.099-10.975c-7.788,1.146-12.782,6.786-12.782,13.327c0,8.8,8.244,11.332,14.43,13.181c6.509,1.944,8.401,2.637,8.401,5.023c0,2.016-1.196,3.895-4.374,4.735c-6.32,1.664-14.586-0.672-16.887-4.523c-1.351-2.261-2.733-5.203-4.001-8.53c-3.766-9.866-8.926-23.371-23.764-23.371c-7.731,0-21.851,3.743-21.851,24.868c0,8.744,7.481,19.613,21.578,19.613c11.829,0,13.888-4.32,14.358-5.085l-3.861-7.555c-0.098,0.138-3.692,4.936-10.497,4.936c-11.107,0-12.735-11.776-12.735-11.909c0-10.967,4.687-16.238,13.008-16.238c8.094,0,11.382,7.04,15.48,17.759c1.397,3.683,2.922,6.966,4.65,9.865c3.657,6.116,11.55,8.091,19.473,8.091c2.418,0,5.2,0.137,7.351-0.432c7.093-1.878,10.905-6.178,10.905-12.224C95.137,56.218,86.852,54.044,80.487,52.141z'/%3e%3c/svg%3e");
    --discogs-logo-white: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23FFFFFF'%3e%3cpath d='M1.7422 11.982c0-5.6682 4.61-10.2782 10.2758-10.2782 1.8238 0 3.5372.48 5.0251 1.3175l.8135-1.4879C16.1768.588 14.2474.036 12.1908.0024h-.1944C5.4091.0144.072 5.3107 0 11.886v.1152c.0072 3.4389 1.4567 6.5345 3.7748 8.7207l1.1855-1.2814c-1.9798-1.8743-3.218-4.526-3.218-7.4585zM20.362 3.4053l-1.1543 1.2406c1.903 1.867 3.0885 4.4636 3.0885 7.3361 0 5.6658-4.61 10.2758-10.2758 10.2758-1.783 0-3.4605-.456-4.922-1.2575l-.8542 1.5214c1.7086.9384 3.6692 1.4735 5.7546 1.4759C18.6245 23.9976 24 18.6246 24 11.9988c-.0048-3.3717-1.399-6.4146-3.638-8.5935zM1.963 11.982c0 2.8701 1.2119 5.4619 3.146 7.2953l1.1808-1.2767c-1.591-1.5166-2.587-3.6524-2.587-6.0186 0-4.586 3.7293-8.3152 8.3152-8.3152 1.483 0 2.875.3912 4.082 1.0751l.8351-1.5262C15.481 2.395 13.8034 1.927 12.018 1.927 6.4746 1.9246 1.963 6.4362 1.963 11.982zm18.3702 0c0 4.586-3.7293 8.3152-8.3152 8.3152-1.4327 0-2.7837-.3648-3.962-1.0055l-.852 1.5166c1.4303.7823 3.0718 1.2287 4.814 1.2287 5.5434 0 10.055-4.5116 10.055-10.055 0-2.8077-1.1567-5.3467-3.0165-7.1729l-1.183 1.2743c1.519 1.507 2.4597 3.5924 2.4597 5.8986zm-1.9486 0c0 3.5109-2.8558 6.3642-6.3642 6.3642a6.3286 6.3286 0 01-3.0069-.756l-.8471 1.507c1.147.624 2.4597.9768 3.854.9768 4.4636 0 8.0944-3.6308 8.0944-8.0944 0-2.239-.9143-4.2692-2.3902-5.7378l-1.1783 1.267c1.1351 1.152 1.8383 2.731 1.8383 4.4732zm-14.4586 0c0 2.3014.9671 4.382 2.515 5.8578l1.1734-1.2695c-1.207-1.159-1.9606-2.786-1.9606-4.5883 0-3.5108 2.8557-6.3642 6.3642-6.3642 1.1423 0 2.215.3048 3.1437.8352l.8303-1.5167c-1.1759-.6647-2.5317-1.0487-3.974-1.0487-4.4612 0-8.092 3.6308-8.092 8.0944zm12.5292 0c0 2.4502-1.987 4.4372-4.4372 4.4372a4.4192 4.4192 0 01-2.0614-.5088l-.8351 1.4879a6.1135 6.1135 0 002.8965.727c3.3885 0 6.1434-2.7548 6.1434-6.1433 0-1.6774-.6767-3.1989-1.7686-4.3076l-1.1615 1.2503c.7559.7967 1.2239 1.8718 1.2239 3.0573zm-10.5806 0c0 1.7374.7247 3.3069 1.8886 4.4252L8.92 15.1569l.0144.0144c-.8351-.8063-1.3559-1.9366-1.3559-3.1869 0-2.4502 1.9846-4.4372 4.4372-4.4372.8087 0 1.5646.2184 2.2174.5976l.8207-1.4975a6.097 6.097 0 00-3.0381-.8063c-3.3837-.0048-6.141 2.7525-6.141 6.141zm6.681 0c0 .2952-.2424.5351-.5376.5351-.2952 0-.5375-.24-.5375-.5351 0-.2976.24-.5375.5375-.5375.2952 0 .5375.24.5375.5375zm-3.9405 0c0-1.879 1.5239-3.4029 3.4005-3.4029 1.879 0 3.4005 1.5215 3.4005 3.4029 0 1.879-1.5239 3.4005-3.4005 3.4005S8.6151 13.861 8.6151 11.982zm.1488 0c.0048 1.7974 1.4567 3.2493 3.2517 3.2517 1.795 0 3.254-1.4567 3.254-3.2517-.0023-1.7974-1.4566-3.2517-3.254-3.254-1.795 0-3.2517 1.4566-3.2517 3.254Z'/%3e%3c/svg%3e");
}

/* Global font - using Bootstrap default font stack */
body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
    padding-top: 76px; /* Account for fixed navbar */
}

/* Navbar styling */
.navbar {
    background-color: var(--medium-navy);
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.navbar-brand {
    color: var(--accent-grey);
    font-weight: bold;
    transition: color 0.2s ease-in-out;
}

.navbar-brand:hover {
    color: var(--text-light);
}

.navbar-nav .nav-link {
    color: rgba(224,224,224,0.8);
    transition: color 0.2s ease-in-out;
}

.navbar-nav .nav-link.active {
    color: var(--light-accent);
    font-weight: bold;
}

.navbar-nav .nav-link:hover,
.navbar-nav .nav-link:focus {
    color: var(--text-light);
}

.navbar-toggler {
    border-color: rgba(224,224,224,0.1);
}

.navbar-toggler-icon {
    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3e%3cpath stroke='rgba%28224, 224, 224, 0.8%29' stroke-linecap='round' stroke-miterlimit='10' stroke-width='2' d='M4 7h22M4 15h22M4 23h22'/%3e%3c/svg%3e");
}

/* Spinning navbar icon animation */
.navbar-icon {
    animation: spin 4s linear infinite;
    transition: transform 0.3s ease-in-out;
}

.navbar-brand:hover .navbar-icon {
    transform: scale(1.2);
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

/* Jumbotron styling */
.jumbotron-background {
    background-image: url('https://www.russ.fm/images/sticker-clear.svg');
    background-size: contain;
    background-repeat: no-repeat;
    background-position: bottom right;
    background-color: var(--light-navy);
}

/* User header specific styling */
#user-header {
    position: relative;
    overflow: hidden;
}

#user-header::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(61, 66, 85, 0.95) 0%, rgba(61, 66, 85, 0.8) 40%, rgba(61, 66, 85, 0.4) 70%, rgba(61, 66, 85, 0.1) 100%);
    z-index: 1;
}

#user-header .text-container {
    position: relative;
    z-index: 2;
}

#user-header .user-avatar {
    transition: transform 0.3s ease;
    position: relative;
    z-index: 2;
}

#user-header:hover .user-avatar {
    transform: scale(1.05);
}

#user-header .user-stats {
    font-size: 0.9rem;
    opacity: 0.9;
}

#user-header .user-stats i {
    opacity: 0.8;
}

.refresh-artwork-btn {
    position: absolute;
    bottom: 1rem;
    right: 1rem;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: rgba(255, 255, 255, 0.7);
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    backdrop-filter: blur(10px);
    z-index: 3;
    cursor: pointer;
}

.refresh-artwork-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.9);
    transform: rotate(180deg) scale(1.1);
}

.refresh-artwork-btn:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3);
}

/* Pro badge styling */
.pro-badge {
    background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
    color: #1a1e2e;
    font-weight: bold;
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 1rem;
    text-shadow: none;
    box-shadow: 0 2px 4px rgba(255, 215, 0, 0.3);
    animation: subtle-glow 2s ease-in-out infinite alternate;
}

.pro-badge i {
    color: #1a1e2e;
}

@keyframes subtle-glow {
    from {
        box-shadow: 0 2px 4px rgba(255, 215, 0, 0.3);
    }
    to {
        box-shadow: 0 2px 8px rgba(255, 215, 0, 0.5);
    }
}

/* Bootstrap component overrides */
.btn-primary {
    background-color: var(--dark-navy);
    border-color: var(--dark-navy);
}

.btn-primary:hover {
    background-color: var(--medium-navy);
    border-color: var(--medium-navy);
}

.btn-secondary {
    background-color: var(--accent-grey);
    border-color: var(--accent-grey);
    color: var(--dark-navy);
}

.btn-secondary:hover {
    background-color: var(--text-light);
    border-color: var(--text-light);
    color: var(--dark-navy);
}

/* Brand-specific button styling */
#discogs-search-btn {
    background-color: var(--discogs-dark);
    border-color: var(--discogs-dark);
    color: white;
}

#discogs-search-btn:hover {
    background-color: #555555;
    border-color: #555555;
    color: white;
}

#login-btn {
    background-color: var(--lastfm-red);
    border-color: var(--lastfm-red);
    color: white;
}

#login-btn:hover {
    background-color: #b50e06;
    border-color: #b50e06;
    color: white;
}

#album-search-btn {
    background-color: var(--lastfm-red);
    border-color: var(--lastfm-red);
    color: white;
}

#album-search-btn:hover {
    background-color: #b50e06;
    border-color: #b50e06;
    color: white;
}

/* Scrobble button styling - use Last.fm branding */
#scrobble-all-btn {
    background-color: var(--lastfm-red);
    border-color: var(--lastfm-red);
    color: white;
}

#scrobble-all-btn:hover {
    background-color: #b50e06;
    border-color: #b50e06;
    color: white;
}

/* Brand-specific link styling */
a[href*="discogs.com"] {
    color: var(--discogs-dark) !important;
    text-decoration: none;
    font-weight: 500;
}

a[href*="discogs.com"]:hover {
    color: #555555 !important;
    text-decoration: underline;
}

a[href*="last.fm"] {
    color: var(--lastfm-red) !important;
    text-decoration: none;
    font-weight: 500;
}

a[href*="last.fm"]:hover {
    color: #b50e06 !important;
    text-decoration: underline;
}

/* View on Discogs button styling */
.btn-outline-secondary,
.btn-outline-secondary:link,
.btn-outline-secondary:visited,
.btn-outline-secondary:active,
.btn-outline-secondary:focus {
    background-color: var(--discogs-dark) !important;
    border-color: var(--discogs-dark) !important;
    color: white !important;
    font-weight: 500;
    text-decoration: none !important;
}

.btn-outline-secondary:hover,
.btn-outline-secondary:focus:hover {
    background-color: #555555 !important;
    border-color: #555555 !important;
    color: white !important;
    text-decoration: none !important;
}

.btn-outline-secondary .discogs-logo::before {
    background-image: var(--discogs-logo-white); /* White logo on dark background */
}

.btn-outline-secondary:hover .discogs-logo::before {
    background-image: var(--discogs-logo-white); /* Keep white logo on hover */
}

/* Extra specific styling for link-based Discogs button */
a.btn-outline-secondary {
    color: white !important;
}

a.btn-outline-secondary:hover {
    color: white !important;
}

.bg-primary {
    background-color: var(--light-navy) !important;
}

/* Card styling */
.card {
    border: 1px solid rgba(0,0,0,0.125);
    box-shadow: 0 0.125rem 0.25rem rgba(0,0,0,0.075);
}

.card-img-top {
    transition: transform 0.3s ease;
}

.card:hover .card-img-top {
    transform: scale(1.05);
}

/* Form controls */
.form-control:focus {
    border-color: var(--dark-navy);
    box-shadow: 0 0 0 0.2rem rgba(26, 30, 46, 0.25);
}

.form-check-input:checked {
    background-color: var(--dark-navy);
    border-color: var(--dark-navy);
}

/* Loading animation for buttons - using animated dots instead of spinner */
.loading {
    pointer-events: none;
}

.loading-dots::after {
    content: '';
    animation: dots 1.5s steps(4, end) infinite;
}

@keyframes dots {
    0%, 20% {
        content: '';
    }
    40% {
        content: '.';
    }
    60% {
        content: '..';
    }
    80%, 100% {
        content: '...';
    }
}



/* Temporary success state for buttons */
.btn-success-temp {
    background-color: #28a745 !important;
    border-color: #28a745 !important;
    color: white !important;
    transition: all 0.3s ease;
}

.btn-success-temp:hover {
    background-color: #218838 !important;
    border-color: #1e7e34 !important;
}

/* Album result cards */
.album-card {
    transition: box-shadow 0.2s ease;
    cursor: pointer;
}

.album-card:hover {
    box-shadow: 0 0.5rem 1rem rgba(0,0,0,0.15);
}

/* Track list styling */
.track-item {
    padding: 0.75rem;
    border: 1px solid #dee2e6;
    border-radius: 0.375rem;
    margin-bottom: 0.5rem;
    background-color: #f8f9fa;
    transition: all 0.2s ease;
}

.track-item:hover {
    background-color: #e9ecef;
    transform: translateX(5px);
}

.track-item .btn {
    opacity: 0.7;
    transition: opacity 0.2s ease;
}

.track-item:hover .btn {
    opacity: 1;
}

/* Status messages */
.alert {
    border-radius: 0.5rem;
    border: none;
    font-weight: 500;
    box-shadow: 0 0.125rem 0.25rem rgba(0,0,0,0.075);
}

.alert-info {
    background-color: #d1ecf1;
    color: #0c5460;
    border-left: 4px solid #17a2b8;
}

.alert-success {
    background-color: #d4edda;
    color: #155724;
    border-left: 4px solid #28a745;
}

.alert-danger {
    background-color: #f8d7da;
    color: #721c24;
    border-left: 4px solid #dc3545;
}

.alert-warning {
    background-color: #fff3cd;
    color: #856404;
    border-left: 4px solid #ffc107;
}

/* Responsive adjustments */
@media (max-width: 992px) {
    .jumbotron-background {
        background-image: none;
    }
    
    .text-container {
        text-align: center;
        padding: 2rem 1rem;
    }
    
    .text-container h1 {
        font-size: 2rem;
    }
    
    .text-container p {
        font-size: 1.25rem;
    }
}

/* Hide cover image on mobile for user header */
@media (max-width: 768px) {
    #user-header {
        background-image: none !important;
    }
}

@media (max-width: 768px) {
    body {
        padding-top: 66px;
    }
    
    .container {
        padding-left: 1rem;
        padding-right: 1rem;
    }
    
    .btn {
        width: 100%;
        margin-bottom: 0.5rem;
    }
    
    .d-flex.gap-2 {
        flex-direction: column;
    }
}

/* Pagination styling */
.pagination .page-link {
    color: var(--dark-navy);
    border-color: #dee2e6;
}

.pagination .page-link:hover {
    color: var(--medium-navy);
    background-color: #e9ecef;
    border-color: #dee2e6;
}

.pagination .page-item.active .page-link {
    background-color: var(--dark-navy);
    border-color: var(--dark-navy);
}

/* Hide text and adjust buttons for mobile devices */
@media (max-width: 768px) {
    .pagination .page-item .page-link span {
        display: none;
    }
    
    .pagination .page-item .page-link[aria-label="Previous"]::before {
        content: "←";
    }
    
    .pagination .page-item .page-link[aria-label="Next"]::after {
        content: "→";
    }
    
    .pagination .page-item .page-link[aria-label="First"]::before {
        content: "<<";
    }
    
    .pagination .page-item .page-link[aria-label="Last"]::after {
        content: ">>";
    }
    
    .pagination .page-link {
        padding: 8px 12px;
    }
}

/* Simple Footer styling */
footer a:hover {
    color: var(--accent-grey) !important;
    text-decoration: none;
}

/* Footer API links - white text - override brand colors */
footer .footer-api-link,
footer .footer-api-link:link,
footer .footer-api-link:visited,
footer .footer-api-link:active,
footer a[href*="discogs.com"].footer-api-link,
footer a[href*="last.fm"].footer-api-link {
    color: white !important;
    text-decoration: none !important;
    font-weight: bold !important;
}

footer .footer-api-link:hover,
footer .footer-api-link:focus,
footer a[href*="discogs.com"].footer-api-link:hover,
footer a[href*="last.fm"].footer-api-link:hover {
    color: var(--accent-grey) !important;
    text-decoration: none !important;
    font-weight: bold !important;
}

/* Footer source code link - no underline */
.footer-source-link {
    color: var(--text-light) !important;
    text-decoration: none !important;
    font-weight: bold;
}

.footer-source-link:hover {
    color: var(--accent-grey) !important;
    text-decoration: none !important;
}

/* Footer site link */
.footer-site-link {
    color: var(--text-light) !important;
    text-decoration: none;
    font-weight: bold;
}

.footer-site-link:hover {
    color: var(--accent-grey) !important;
    text-decoration: none;
}

/* Make all footer text bold */
footer p {
    font-weight: bold;
}

/* Brand logo styling using CSS pseudo-elements */
.discogs-logo::before {
    content: "";
    display: inline-block;
    width: 1em;
    height: 1em;
    background-image: var(--discogs-logo);
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    vertical-align: middle;
}

.lastfm-logo::before {
    content: "";
    display: inline-block;
    width: 1em;
    height: 1em;
    background-image: var(--lastfm-logo);
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    vertical-align: middle;
}

.discogs-logo-white::before {
    content: "";
    display: inline-block;
    width: 1em;
    height: 1em;
    background-image: var(--discogs-logo-white);
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    vertical-align: middle;
}

.lastfm-logo-white::before {
    content: "";
    display: inline-block;
    width: 1em;
    height: 1em;
    background-image: var(--lastfm-logo-white);
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    vertical-align: middle;
}

/* Breadcrumb styling */
.breadcrumb {
    background-color: transparent;
    padding: 0;
    margin: 0;
    font-size: 0.9rem;
}

.breadcrumb-item + .breadcrumb-item::before {
    content: "/";
    color: var(--accent-grey);
    padding: 0 0.5rem;
}

.breadcrumb-item a {
    color: var(--accent-grey);
    text-decoration: none;
    transition: color 0.2s ease;
}

.breadcrumb-item a:hover {
    color: #ffffff;
}

/* Artist name (second item) in breadcrumb */
.breadcrumb-item.artist-name {
    color: var(--discogs-dark);
    font-size: 0.9rem; /* Match the breadcrumb font size */
}

/* Album name (third/active item) in breadcrumb */
.breadcrumb-item.active {
    color: var(--lastfm-red);
}

/* Album Page Layout */
.album-page-container {
    background-color: #ffffff;
    min-height: 100vh;
    color: #333333;
}

.breadcrumb-nav {
    background-color: #f8f9fa;
    padding: 1rem 0;
    border-bottom: 1px solid #dee2e6;
}

.breadcrumb-nav .container {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.data-source {
    color: #6c757d;
    font-size: 0.9rem;
}

.album-content {
    padding: 2rem 0;
}

.album-info-card {
    background-color: #ffffff;
    border: 1px solid #dee2e6;
    border-radius: 0.5rem;
    padding: 1.5rem;
    margin-bottom: 2rem;
    box-shadow: 0 0.125rem 0.25rem rgba(0,0,0,0.075);
}

.album-cover {
    width: 100%;
    border-radius: 0.5rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 0.25rem 0.5rem rgba(0,0,0,0.1);
}

.album-details {
    margin-bottom: 1.5rem;
}

.album-title {
    font-size: 1.5rem;
    font-weight: bold;
    color: #333333;
    margin-bottom: 0.5rem;
}

.artist-name {
    font-size: 1.2rem;
    color: #6c757d;
    margin-bottom: 0.5rem;
}

.album-year, .album-format {
    color: #6c757d;
    font-size: 0.9rem;
}

.scrobble-actions .btn-success {
    background-color: var(--lastfm-red);
    border-color: var(--lastfm-red);
    font-weight: 500;
    color: white;
}

.scrobble-actions .btn-success:hover {
    background-color: #b50e06;
    border-color: #b50e06;
    color: white;
}

.track-list-container {
    background-color: #ffffff;
    border: 1px solid #dee2e6;
    border-radius: 0.5rem;
    padding: 1rem;
    box-shadow: 0 0.125rem 0.25rem rgba(0,0,0,0.075);
}

.track-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    border-bottom: 1px solid #e9ecef;
    transition: background-color 0.2s ease;
}

.track-row:last-child {
    border-bottom: none;
}

.track-row:hover {
    background-color: #f8f9fa;
}

.track-info {
    display: flex;
    align-items: center;
    flex-grow: 1;
}

.track-number {
    background-color: #6c757d;
    color: #ffffff;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.8rem;
    margin-right: 1rem;
    min-width: 2rem;
    text-align: center;
}

.track-title {
    color: #333333;
    font-weight: 500;
    flex-grow: 1;
}

.track-duration {
    color: #6c757d;
    font-size: 0.9rem;
    margin-left: auto;
    margin-right: 1rem;
}

.track-scrobble-btn {
    background-color: var(--lastfm-red);
    border-color: var(--lastfm-red);
    color: #ffffff;
    font-size: 0.8rem;
    padding: 0.375rem 0.75rem;
}

.track-scrobble-btn:hover {
    background-color: #b50e06;
    border-color: #b50e06;
    color: white;
}

.back-button-container {
    text-align: center;
    margin-top: 2rem;
}

/* Responsive adjustments for album page */
@media (max-width: 768px) {
    .album-content {
        padding: 1rem 0;
    }
    
    .album-info-card {
        margin-bottom: 1rem;
    }
    
    .track-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
    }
    
    .track-info {
        width: 100%;
    }
    
    .track-scrobble-btn {
        align-self: flex-end;
    }
    
    .breadcrumb-nav .container {
        flex-direction: column;
        gap: 0.5rem;
    }
}
`; 