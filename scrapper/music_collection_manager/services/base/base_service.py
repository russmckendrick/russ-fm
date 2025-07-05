"""Base service class for all API services."""

import time
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, Tuple
from datetime import datetime, timedelta

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .exceptions import APIError, RateLimitError, AuthenticationError


class RateLimiter:
    """Simple rate limiter to prevent API throttling."""
    
    def __init__(self, requests_per_minute: int = 60):
        self.requests_per_minute = requests_per_minute
        self.min_interval = 60.0 / requests_per_minute
        self.last_request_time = 0
    
    def wait_if_needed(self):
        """Wait if necessary to respect rate limits."""
        current_time = time.time()
        time_since_last_request = current_time - self.last_request_time
        
        if time_since_last_request < self.min_interval:
            wait_time = self.min_interval - time_since_last_request
            time.sleep(wait_time)
        
        self.last_request_time = time.time()


class BaseService(ABC):
    """Base class for all API services."""
    
    def __init__(self, config: Dict[str, Any], logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or logging.getLogger(self.__class__.__name__)
        self.session = self._create_session()
        self.rate_limiter = self._create_rate_limiter()
        self._auth_token = None
        self._token_expires_at = None
    
    def _create_session(self) -> requests.Session:
        """Create a requests session with retry logic."""
        session = requests.Session()
        
        # Configure retry strategy
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        
        # Set default timeout
        session.timeout = 30
        
        return session
    
    def _create_rate_limiter(self) -> RateLimiter:
        """Create rate limiter based on service configuration."""
        requests_per_minute = self.config.get("rate_limit", 60)
        return RateLimiter(requests_per_minute)
    
    @abstractmethod
    def authenticate(self) -> None:
        """Authenticate with the service."""
        pass
    
    @abstractmethod
    def search_release(self, artist: str, album: str, **kwargs) -> Dict[str, Any]:
        """Search for a release by artist and album name."""
        pass
    
    @abstractmethod
    def get_release_details(self, release_id: str) -> Dict[str, Any]:
        """Get detailed information about a specific release."""
        pass
    
    def _make_request(
        self,
        method: str,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> requests.Response:
        """Make an HTTP request with error handling and rate limiting."""
        # Wait if needed for rate limiting
        self.rate_limiter.wait_if_needed()
        
        # Prepare request
        headers = headers or {}
        
        try:
            response = self.session.request(
                method=method,
                url=url,
                headers=headers,
                params=params,
                json=json_data,
                timeout=kwargs.get("timeout", 30),
                **kwargs
            )
            
            # Check for rate limiting
            if response.status_code == 429:
                retry_after = response.headers.get("Retry-After", 60)
                raise RateLimitError(
                    f"Rate limit exceeded for {url}",
                    retry_after=int(retry_after)
                )
            
            # Check for authentication errors
            if response.status_code in [401, 403]:
                raise AuthenticationError(
                    f"Authentication failed for {url}: {response.status_code}"
                )
            
            # Check for other errors
            response.raise_for_status()
            
            return response
            
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Request failed for {url}: {str(e)}")
            raise APIError(f"Request failed: {str(e)}")
    
    def _get_auth_headers(self) -> Dict[str, str]:
        """Get authentication headers for requests."""
        return {}
    
    def _is_token_expired(self) -> bool:
        """Check if the authentication token has expired."""
        if not self._token_expires_at:
            return True
        return datetime.now() >= self._token_expires_at
    
    def ensure_authenticated(self) -> None:
        """Ensure the service is authenticated, refreshing token if needed."""
        if self._is_token_expired():
            self.authenticate()