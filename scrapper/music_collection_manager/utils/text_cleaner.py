"""Text cleaning utilities for ensuring JSON compatibility and data consistency."""

import html
import re
import unicodedata
from typing import Any, Dict, List, Union


class TextCleaner:
    """Utility class for cleaning and normalizing text data."""
    
    @staticmethod
    def clean_for_json(text: str) -> str:
        """
        Clean text content to ensure JSON compatibility.
        
        This method handles common issues with text data from APIs:
        - Removes null bytes and control characters
        - Normalizes line endings
        - Unescapes HTML entities
        - Ensures proper UTF-8 encoding
        - Removes problematic Unicode characters
        
        Args:
            text: Raw text string to clean
            
        Returns:
            Cleaned text string safe for JSON serialization
        """
        if not text or not isinstance(text, str):
            return ""
        
        # Handle HTML entities first
        text = html.unescape(text)
        
        # Remove null bytes and normalize line endings
        text = text.replace('\x00', '')  # Remove null bytes
        text = text.replace('\r\n', '\n')  # Normalize CRLF to LF
        text = text.replace('\r', '\n')   # Normalize CR to LF
        
        # Ensure proper UTF-8 encoding
        try:
            text = text.encode('utf-8', errors='ignore').decode('utf-8')
        except (UnicodeDecodeError, UnicodeEncodeError):
            # If encoding fails, remove non-ASCII characters
            text = ''.join(char for char in text if ord(char) < 127)
        
        # Remove control characters except for common whitespace
        # Keep newlines (\n = 10), tabs (\t = 9), and regular spaces (32+)
        cleaned = ''.join(char for char in text if ord(char) >= 32 or char in '\n\t')
        
        # Normalize Unicode to NFC form (canonical decomposition + composition)
        cleaned = unicodedata.normalize('NFC', cleaned)
        
        # Remove any remaining problematic characters
        cleaned = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', cleaned)
        
        return cleaned.strip()
    
    @staticmethod
    def clean_for_filename(text: str, max_length: int = 255) -> str:
        """
        Clean text to make it safe for use as a filename.
        
        Args:
            text: Raw text string
            max_length: Maximum length for the filename
            
        Returns:
            Filename-safe string
        """
        if not text or not isinstance(text, str):
            return "unknown"
        
        # Convert to lowercase and strip
        text = text.lower().strip()
        
        # Replace spaces and common separators with hyphens
        text = re.sub(r'[\s\-_]+', '-', text)
        
        # Remove or replace problematic characters
        text = re.sub(r'[^\w\-]', '', text)
        
        # Remove multiple consecutive hyphens
        text = re.sub(r'-+', '-', text)
        
        # Remove leading/trailing hyphens
        text = text.strip('-')
        
        # Truncate if too long
        if len(text) > max_length:
            text = text[:max_length].rstrip('-')
        
        return text or "unknown"
    
    @staticmethod
    def clean_for_url(text: str) -> str:
        """
        Clean text to make it URL-safe.
        
        Args:
            text: Raw text string
            
        Returns:
            URL-safe string
        """
        if not text or not isinstance(text, str):
            return ""
        
        # First clean for JSON to handle encoding issues
        text = TextCleaner.clean_for_json(text)
        
        # Convert to lowercase
        text = text.lower()
        
        # Replace spaces and common separators with hyphens
        text = re.sub(r'[\s\-_]+', '-', text)
        
        # Keep only alphanumeric characters and hyphens
        text = re.sub(r'[^a-z0-9\-]', '', text)
        
        # Remove multiple consecutive hyphens
        text = re.sub(r'-+', '-', text)
        
        # Remove leading/trailing hyphens
        text = text.strip('-')
        
        return text
    
    @staticmethod
    def truncate_with_ellipsis(text: str, max_length: int) -> str:
        """
        Truncate text to specified length, adding ellipsis if truncated.
        
        Args:
            text: Text to truncate
            max_length: Maximum length including ellipsis
            
        Returns:
            Truncated text with ellipsis if needed
        """
        if not text or not isinstance(text, str):
            return ""
        
        if len(text) <= max_length:
            return text
        
        if max_length <= 3:
            return "..."[:max_length]
        
        return text[:max_length - 3] + "..."
    
    @staticmethod
    def extract_first_paragraph(text: str, max_length: int = 500) -> str:
        """
        Extract the first paragraph from text.
        
        Args:
            text: Full text content
            max_length: Maximum length for the paragraph
            
        Returns:
            First paragraph, optionally truncated
        """
        if not text or not isinstance(text, str):
            return ""
        
        # Clean the text first
        text = TextCleaner.clean_for_json(text)
        
        # Split by double newlines (paragraph breaks)
        paragraphs = text.split('\n\n')
        
        if not paragraphs:
            return ""
        
        first_paragraph = paragraphs[0].strip()
        
        # If the first paragraph is too short, try to include the next one
        if len(first_paragraph) < 100 and len(paragraphs) > 1:
            second_paragraph = paragraphs[1].strip()
            combined = f"{first_paragraph}\n\n{second_paragraph}"
            if len(combined) <= max_length:
                first_paragraph = combined
        
        # Truncate if needed
        if len(first_paragraph) > max_length:
            first_paragraph = TextCleaner.truncate_with_ellipsis(first_paragraph, max_length)
        
        return first_paragraph
    
    @staticmethod
    def clean_data_recursively(data: Any) -> Any:
        """
        Recursively clean all text data in a nested structure.
        
        Args:
            data: Data structure (dict, list, or primitive)
            
        Returns:
            Cleaned data structure
        """
        if isinstance(data, dict):
            return {key: TextCleaner.clean_data_recursively(value) for key, value in data.items()}
        elif isinstance(data, list):
            return [TextCleaner.clean_data_recursively(item) for item in data]
        elif isinstance(data, str):
            return TextCleaner.clean_for_json(data)
        else:
            return data
    
    @staticmethod
    def remove_html_tags(text: str) -> str:
        """
        Remove HTML tags from text while preserving content.
        
        Args:
            text: Text containing HTML tags
            
        Returns:
            Text with HTML tags removed
        """
        if not text or not isinstance(text, str):
            return ""
        
        # Remove HTML tags
        clean = re.sub(r'<[^>]+>', '', text)
        
        # Clean up extra whitespace
        clean = re.sub(r'\s+', ' ', clean)
        
        return clean.strip()
    
    @staticmethod
    def normalize_whitespace(text: str) -> str:
        """
        Normalize whitespace in text.
        
        Args:
            text: Text with irregular whitespace
            
        Returns:
            Text with normalized whitespace
        """
        if not text or not isinstance(text, str):
            return ""
        
        # Replace multiple spaces with single spaces
        text = re.sub(r' +', ' ', text)
        
        # Replace multiple newlines with double newlines
        text = re.sub(r'\n\n+', '\n\n', text)
        
        # Remove trailing whitespace from lines
        text = '\n'.join(line.rstrip() for line in text.split('\n'))
        
        return text.strip()


# Convenience functions for backward compatibility and ease of use
def clean_for_json(text: str) -> str:
    """Convenience function for cleaning text for JSON."""
    return TextCleaner.clean_for_json(text)


def clean_for_filename(text: str, max_length: int = 255) -> str:
    """Convenience function for cleaning text for filenames."""
    return TextCleaner.clean_for_filename(text, max_length)


def clean_for_url(text: str) -> str:
    """Convenience function for cleaning text for URLs."""
    return TextCleaner.clean_for_url(text)


def clean_discogs_artist_name(artist_name: str) -> str:
    """
    Remove Discogs numbering from artist names.
    
    Discogs uses numbers in parentheses to distinguish between artists
    with the same name, e.g., "Jellyfish (2)". This function removes
    these numbers while preserving other valid parentheses.
    
    Args:
        artist_name: Artist name potentially containing Discogs numbering
        
    Returns:
        Artist name with Discogs numbering removed
    """
    if not artist_name or not isinstance(artist_name, str):
        return artist_name
    
    # Remove trailing numbers in parentheses (e.g., "(2)", "(10)")
    # This regex matches a space followed by parentheses containing only digits at the end
    cleaned = re.sub(r'\s*\(\d+\)$', '', artist_name)
    
    return cleaned.strip()