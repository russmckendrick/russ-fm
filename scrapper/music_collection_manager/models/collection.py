"""Collection data models."""

from dataclasses import dataclass, field
from typing import Optional, Dict, Any
from datetime import datetime

from .release import Release


@dataclass
class CollectionItem:
    """Represents an item in a user's collection."""
    id: str
    release: Release
    folder_id: Optional[str] = None
    date_added: Optional[datetime] = None
    notes: Optional[str] = None
    rating: Optional[int] = None
    
    # Collection-specific metadata
    instance_id: Optional[str] = None  # Discogs instance ID
    basic_information: Dict[str, Any] = field(default_factory=dict)
    
    # Processing status
    processed: bool = False
    enriched: bool = False
    
    def __post_init__(self):
        """Post-initialization processing."""
        if self.date_added is None:
            self.date_added = datetime.now()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert collection item to dictionary."""
        return {
            'id': self.id,
            'release': self.release.to_dict(),
            'folder_id': self.folder_id,
            'date_added': self.date_added.isoformat() if self.date_added else None,
            'notes': self.notes,
            'rating': self.rating,
            'instance_id': self.instance_id,
            'basic_information': self.basic_information,
            'processed': self.processed,
            'enriched': self.enriched,
        }