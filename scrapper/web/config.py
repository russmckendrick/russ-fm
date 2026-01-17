"""Web configuration for Music Collection Manager."""

import os
from typing import Optional
from pydantic import BaseModel


class WebConfig(BaseModel):
    """Web application configuration."""

    # Server settings
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    # Authentication
    admin_username: str = "admin"
    admin_password: str = "changeme"

    # Paths
    static_dir: str = "web/static"
    templates_dir: str = "web/templates"

    # Task settings
    max_concurrent_tasks: int = 1  # Keep sequential for SQLite
    task_timeout: int = 3600  # 1 hour default timeout

    @classmethod
    def from_env(cls) -> "WebConfig":
        """Load configuration from environment variables."""
        return cls(
            host=os.getenv("WEB_HOST", "0.0.0.0"),
            port=int(os.getenv("WEB_PORT", "8000")),
            debug=os.getenv("WEB_DEBUG", "false").lower() == "true",
            admin_username=os.getenv("WEB_ADMIN_USERNAME", "admin"),
            admin_password=os.getenv("WEB_ADMIN_PASSWORD", "changeme"),
            static_dir=os.getenv("WEB_STATIC_DIR", "web/static"),
            templates_dir=os.getenv("WEB_TEMPLATES_DIR", "web/templates"),
            max_concurrent_tasks=int(os.getenv("WEB_MAX_TASKS", "1")),
            task_timeout=int(os.getenv("WEB_TASK_TIMEOUT", "3600")),
        )


# Global config instance
web_config = WebConfig.from_env()
