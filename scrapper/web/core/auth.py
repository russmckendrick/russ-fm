"""Basic authentication for the web interface."""

import secrets
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from ..config import web_config

security = HTTPBasic()


def verify_credentials(
    credentials: HTTPBasicCredentials = Depends(security),
) -> str:
    """Verify HTTP Basic credentials.

    Returns the username if valid, raises HTTPException otherwise.
    """
    correct_username = secrets.compare_digest(
        credentials.username.encode("utf8"),
        web_config.admin_username.encode("utf8"),
    )
    correct_password = secrets.compare_digest(
        credentials.password.encode("utf8"),
        web_config.admin_password.encode("utf8"),
    )

    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )

    return credentials.username


def get_current_user(username: str = Depends(verify_credentials)) -> str:
    """Get the current authenticated user."""
    return username


# Optional: For pages that don't require auth
def get_optional_user(
    credentials: Optional[HTTPBasicCredentials] = Depends(
        HTTPBasic(auto_error=False)
    ),
) -> Optional[str]:
    """Get user if authenticated, None otherwise."""
    if credentials is None:
        return None

    try:
        return verify_credentials(credentials)
    except HTTPException:
        return None
