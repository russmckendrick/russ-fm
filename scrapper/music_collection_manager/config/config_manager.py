"""Configuration management for the music collection manager."""

import os
import json
import yaml
from typing import Dict, Any, Optional
from pathlib import Path


class ConfigManager:
    """Manages configuration from multiple sources."""
    
    def __init__(self, config_file: Optional[str] = None):
        self.config_file = config_file
        self.config = {}
        self._load_config()
    
    def _load_config(self):
        """Load configuration from file and environment variables."""
        # Start with default configuration
        self.config = self._get_default_config()
        
        # Load from file if provided
        if self.config_file:
            file_config = self._load_from_file(self.config_file)
            self._merge_config(self.config, file_config)
        
        # Override with environment variables
        env_config = self._load_from_env()
        self._merge_config(self.config, env_config)
    
    def _get_default_config(self) -> Dict[str, Any]:
        """Get default configuration."""
        return {
            "database": {
                "path": "collection_cache.db"
            },
            "logging": {
                "level": "INFO",
                "file": "logs/music_collection_manager.log",
                "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
            },
            "discogs": {
                "rate_limit": 60,  # requests per minute
            },
            "apple_music": {
                "rate_limit": 1000,  # requests per hour
                "storefront": "us"
            },
            "spotify": {
                "rate_limit": 100,  # requests per minute
                "market": "US"
            },
            "wikipedia": {
                "language": "en",
                "user_agent": "MusicCollectionManager/1.0"
            },
            "lastfm": {
                "rate_limit": 60,  # requests per minute
            },
            "processing": {
                "batch_size": 10,
                "retry_attempts": 3,
                "retry_delay": 5,  # seconds
                "concurrent_requests": 1,  # Keep sequential for now
            },
            "data": {
                "path": "data"
            }
        }
    
    def _load_from_file(self, config_file: str) -> Dict[str, Any]:
        """Load configuration from file."""
        config_path = Path(config_file)
        
        if not config_path.exists():
            return {}
        
        try:
            with open(config_path, 'r') as f:
                if config_path.suffix.lower() in ['.yml', '.yaml']:
                    return yaml.safe_load(f) or {}
                elif config_path.suffix.lower() == '.json':
                    return json.load(f)
                else:
                    # Try JSON first, then YAML
                    content = f.read()
                    try:
                        return json.loads(content)
                    except json.JSONDecodeError:
                        return yaml.safe_load(content) or {}
        except Exception as e:
            print(f"Warning: Failed to load config file {config_file}: {str(e)}")
            return {}
    
    def _load_from_env(self) -> Dict[str, Any]:
        """Load configuration from environment variables."""
        env_config = {}
        
        # Discogs configuration
        if os.getenv("DISCOGS_ACCESS_TOKEN"):
            env_config.setdefault("discogs", {})["access_token"] = os.getenv("DISCOGS_ACCESS_TOKEN")
        if os.getenv("DISCOGS_USERNAME"):
            env_config.setdefault("discogs", {})["username"] = os.getenv("DISCOGS_USERNAME")
        
        # Apple Music configuration
        if os.getenv("APPLE_MUSIC_KEY_ID"):
            env_config.setdefault("apple_music", {})["key_id"] = os.getenv("APPLE_MUSIC_KEY_ID")
        if os.getenv("APPLE_MUSIC_TEAM_ID"):
            env_config.setdefault("apple_music", {})["team_id"] = os.getenv("APPLE_MUSIC_TEAM_ID")
        if os.getenv("APPLE_MUSIC_PRIVATE_KEY_PATH"):
            env_config.setdefault("apple_music", {})["private_key_path"] = os.getenv("APPLE_MUSIC_PRIVATE_KEY_PATH")
        
        # Spotify configuration
        if os.getenv("SPOTIFY_CLIENT_ID"):
            env_config.setdefault("spotify", {})["client_id"] = os.getenv("SPOTIFY_CLIENT_ID")
        if os.getenv("SPOTIFY_CLIENT_SECRET"):
            env_config.setdefault("spotify", {})["client_secret"] = os.getenv("SPOTIFY_CLIENT_SECRET")
        
        # Last.fm configuration
        if os.getenv("LASTFM_API_KEY"):
            env_config.setdefault("lastfm", {})["api_key"] = os.getenv("LASTFM_API_KEY")
        if os.getenv("LASTFM_SHARED_SECRET"):
            env_config.setdefault("lastfm", {})["shared_secret"] = os.getenv("LASTFM_SHARED_SECRET")
        
        # Database configuration
        if os.getenv("DATABASE_PATH"):
            env_config.setdefault("database", {})["path"] = os.getenv("DATABASE_PATH")
        
        # Logging configuration
        if os.getenv("LOG_LEVEL"):
            env_config.setdefault("logging", {})["level"] = os.getenv("LOG_LEVEL")
        if os.getenv("LOG_FILE"):
            env_config.setdefault("logging", {})["file"] = os.getenv("LOG_FILE")
        
        # Data path configuration
        if os.getenv("DATA_PATH"):
            env_config.setdefault("data", {})["path"] = os.getenv("DATA_PATH")
        
        return env_config
    
    def _merge_config(self, base: Dict[str, Any], override: Dict[str, Any]):
        """Merge override configuration into base configuration."""
        for key, value in override.items():
            if key in base and isinstance(base[key], dict) and isinstance(value, dict):
                self._merge_config(base[key], value)
            else:
                base[key] = value
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value by key (supports dot notation)."""
        keys = key.split('.')
        value = self.config
        
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
        
        return value
    
    def get_section(self, section: str) -> Dict[str, Any]:
        """Get entire configuration section."""
        return self.config.get(section, {})
    
    def set(self, key: str, value: Any):
        """Set configuration value by key (supports dot notation)."""
        keys = key.split('.')
        config = self.config
        
        for k in keys[:-1]:
            if k not in config:
                config[k] = {}
            config = config[k]
        
        config[keys[-1]] = value
    
    def validate_config(self) -> Dict[str, bool]:
        """Validate configuration for each service."""
        validation = {}
        
        # Validate Discogs config
        discogs_config = self.get_section("discogs")
        validation["discogs"] = bool(discogs_config.get("access_token"))
        
        # Validate Apple Music config
        apple_config = self.get_section("apple_music")
        validation["apple_music"] = all([
            apple_config.get("key_id"),
            apple_config.get("team_id"),
            apple_config.get("private_key_path")
        ])
        
        # Validate Spotify config
        spotify_config = self.get_section("spotify")
        validation["spotify"] = all([
            spotify_config.get("client_id"),
            spotify_config.get("client_secret")
        ])
        
        # Validate Last.fm config
        lastfm_config = self.get_section("lastfm")
        validation["lastfm"] = bool(lastfm_config.get("api_key"))
        
        # Wikipedia doesn't require credentials
        validation["wikipedia"] = True
        
        return validation
    
    def save_config(self, output_file: str, format: str = "json"):
        """Save current configuration to file."""
        output_path = Path(output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        try:
            with open(output_path, 'w') as f:
                if format.lower() == "yaml":
                    yaml.dump(self.config, f, default_flow_style=False, indent=2)
                else:
                    json.dump(self.config, f, indent=2)
        except Exception as e:
            raise ValueError(f"Failed to save config: {str(e)}")
    
    def create_example_config(self, output_file: str = "config.example.json"):
        """Create an example configuration file."""
        example_config = {
            "discogs": {
                "access_token": "YOUR_DISCOGS_ACCESS_TOKEN",
                "username": "YOUR_DISCOGS_USERNAME"
            },
            "apple_music": {
                "key_id": "YOUR_APPLE_MUSIC_KEY_ID",
                "team_id": "YOUR_APPLE_DEVELOPER_TEAM_ID",
                "private_key_path": "path/to/apple_private_key.p8"
            },
            "spotify": {
                "client_id": "YOUR_SPOTIFY_CLIENT_ID",
                "client_secret": "YOUR_SPOTIFY_CLIENT_SECRET"
            },
            "lastfm": {
                "api_key": "YOUR_LASTFM_API_KEY",
                "shared_secret": "YOUR_LASTFM_SHARED_SECRET"
            },
            "database": {
                "path": "collection_cache.db"
            },
            "logging": {
                "level": "INFO",
                "file": "logs/music_collection_manager.log"
            },
            "data": {
                "path": "data"
            }
        }
        
        try:
            with open(output_file, 'w') as f:
                json.dump(example_config, f, indent=2)
            print(f"Example configuration saved to {output_file}")
        except Exception as e:
            print(f"Failed to create example config: {str(e)}")
    
    def __str__(self) -> str:
        """String representation of configuration."""
        # Hide sensitive information
        safe_config = self._mask_sensitive_data(self.config.copy())
        return json.dumps(safe_config, indent=2)
    
    def _mask_sensitive_data(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Mask sensitive configuration data."""
        sensitive_keys = [
            "access_token", "shared_secret"
        ]
        
        for key, value in config.items():
            if isinstance(value, dict):
                config[key] = self._mask_sensitive_data(value)
            elif key in sensitive_keys and value:
                config[key] = "*" * 8
        
        return config