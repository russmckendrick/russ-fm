"""Perplexity AI service for generating album descriptions."""

import logging
from typing import Dict, Any, Optional
from datetime import datetime

from ..base.base_service import BaseService
from ..base.exceptions import APIError, AuthenticationError


class PerplexityService(BaseService):
    """Service for generating album descriptions using Perplexity AI."""

    BASE_URL = "https://api.perplexity.ai"

    def __init__(self, config: Dict[str, Any], logger: Optional[logging.Logger] = None):
        super().__init__(config, logger)
        self.api_key = config.get("api_key")
        self.model = config.get("model", "sonar")

        if not self.api_key:
            self.logger.warning("Perplexity API key not configured")

    def _create_rate_limiter(self):
        """Create rate limiter with conservative default for Perplexity."""
        from ..base.base_service import RateLimiter
        requests_per_minute = self.config.get("rate_limit", 20)
        return RateLimiter(requests_per_minute)

    def authenticate(self) -> None:
        """No separate authentication needed - uses API key in headers."""
        pass

    def _get_auth_headers(self) -> Dict[str, str]:
        """Get authentication headers for Perplexity API."""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def search_release(self, artist: str, album: str, **kwargs) -> Dict[str, Any]:
        """Not implemented - Perplexity is not used for release searching."""
        raise NotImplementedError("Perplexity service does not support release searching")

    def get_release_details(self, release_id: str) -> Dict[str, Any]:
        """Not implemented - Perplexity is not used for release details."""
        raise NotImplementedError("Perplexity service does not support release details")

    def is_available(self) -> bool:
        """Check if the service is configured and available."""
        return bool(self.api_key)

    def generate_album_description(
        self,
        artist: str,
        album: str,
        year: Optional[int] = None,
        genres: Optional[list] = None,
        labels: Optional[list] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Generate an album description using Perplexity AI.

        Args:
            artist: The artist name
            album: The album title
            year: Release year (optional)
            genres: List of genres (optional)
            labels: List of record labels (optional)

        Returns:
            Dictionary with description and metadata, or None on failure
        """
        if not self.api_key:
            self.logger.warning("Cannot generate description: Perplexity API key not configured")
            return None

        # Build the prompt with rich context
        prompt = self._build_prompt(artist, album, year, genres, labels)

        try:
            response = self._make_request(
                method="POST",
                url=f"{self.BASE_URL}/chat/completions",
                headers=self._get_auth_headers(),
                json_data={
                    "model": self.model,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a knowledgeable music critic and historian. Write concise, factual album descriptions suitable for a music collection website. Focus on the music's style, significance, and reception. Do not include promotional language, purchase links, or speculative information."
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    "max_tokens": 500,
                    "temperature": 0.3  # Lower temperature for more factual responses
                }
            )

            data = response.json()

            if "choices" in data and len(data["choices"]) > 0:
                description = data["choices"][0]["message"]["content"].strip()

                # Clean up the description
                description = self._clean_description(description)

                return {
                    "description": description,
                    "generated_at": datetime.now().isoformat(),
                    "model": self.model,
                    "source": "perplexity"
                }
            else:
                self.logger.warning(f"Unexpected response format from Perplexity: {data}")
                return None

        except AuthenticationError:
            self.logger.error("Perplexity API authentication failed - check your API key")
            return None
        except APIError as e:
            self.logger.error(f"Perplexity API error: {str(e)}")
            return None
        except Exception as e:
            self.logger.error(f"Unexpected error generating description: {str(e)}")
            return None

    def _build_prompt(
        self,
        artist: str,
        album: str,
        year: Optional[int] = None,
        genres: Optional[list] = None,
        labels: Optional[list] = None
    ) -> str:
        """Build the prompt for album description generation."""

        # Start with the basic request
        prompt_parts = [
            f'Write a 2-3 paragraph description of the album "{album}" by {artist}.'
        ]

        # Add context if available
        context_parts = []
        if year:
            context_parts.append(f"released in {year}")
        if genres and len(genres) > 0:
            genre_str = ", ".join(genres[:3])  # Limit to first 3 genres
            context_parts.append(f"genres: {genre_str}")
        if labels and len(labels) > 0:
            label_str = ", ".join(labels[:2])  # Limit to first 2 labels
            context_parts.append(f"label: {label_str}")

        if context_parts:
            prompt_parts.append(f"Context: {'; '.join(context_parts)}.")

        # Add guidance
        prompt_parts.append(
            "Focus on the album's musical style, its place in the artist's discography, "
            "and its critical or commercial reception. Be factual and concise."
        )

        return " ".join(prompt_parts)

    def _clean_description(self, description: str) -> str:
        """Clean up the generated description."""
        import re

        # Remove citation references like [1], [2], [1][2], etc.
        description = re.sub(r'\[\d+\]', '', description)

        # Remove any markdown formatting that might slip through
        description = description.replace("**", "")
        description = description.replace("*", "")

        # Remove any leading/trailing quotes
        description = description.strip('"\'')

        # Clean up extra spaces left by citation removal
        description = re.sub(r' +', ' ', description)

        # Normalize whitespace
        lines = description.split('\n')
        cleaned_lines = [line.strip() for line in lines if line.strip()]
        description = '\n\n'.join(cleaned_lines)

        return description

    def test_connection(self) -> bool:
        """Test the Perplexity API connection."""
        if not self.api_key:
            self.logger.warning("Perplexity API key not configured")
            return False

        try:
            # Make a simple request to test the connection
            response = self._make_request(
                method="POST",
                url=f"{self.BASE_URL}/chat/completions",
                headers=self._get_auth_headers(),
                json_data={
                    "model": self.model,
                    "messages": [
                        {
                            "role": "user",
                            "content": "Say 'OK' if you can hear me."
                        }
                    ],
                    "max_tokens": 10
                }
            )

            data = response.json()
            return "choices" in data and len(data["choices"]) > 0

        except Exception as e:
            self.logger.error(f"Perplexity connection test failed: {str(e)}")
            return False
