"""Custom exceptions for the music collection manager services."""


class ServiceError(Exception):
    """Base exception for all service-related errors."""
    pass


class APIError(ServiceError):
    """Exception raised when an API request fails."""
    def __init__(self, message, status_code=None, response=None):
        super().__init__(message)
        self.status_code = status_code
        self.response = response


class RateLimitError(APIError):
    """Exception raised when API rate limit is exceeded."""
    def __init__(self, message, retry_after=None):
        super().__init__(message)
        self.retry_after = retry_after


class AuthenticationError(APIError):
    """Exception raised when authentication fails."""
    pass


class ConfigurationError(ServiceError):
    """Exception raised when service configuration is invalid."""
    pass


class DataNotFoundError(ServiceError):
    """Exception raised when requested data is not found."""
    pass