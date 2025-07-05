"""Command line interface for the music collection manager."""

from .main import main
from .commands import ReleaseCommand, CollectionCommand, TestCommand

__all__ = ["main", "ReleaseCommand", "CollectionCommand", "TestCommand"]