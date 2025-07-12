import { useState } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Navigation } from '@/components/Navigation';
import { AlbumsPage } from '@/pages/AlbumsPage';
import { ArtistsPage } from '@/pages/ArtistsPage';
import { ArtistDetailPage } from '@/pages/ArtistDetailPage';
import { AlbumDetailPage } from '@/pages/AlbumDetailPage';
import { StatsPage } from '@/pages/StatsPage';
import { SearchResultsPage } from '@/pages/SearchResultsPage';
import { RandomPage } from '@/pages/RandomPage';
import { GenrePage } from '@/pages/GenrePage';

// Component to handle "Various" artist route interception
function ArtistRouteHandler() {
  const { artistPath } = useParams<{ artistPath: string }>();
  
  // Check if this is a "Various" artist route
  if (artistPath && decodeURIComponent(artistPath).toLowerCase() === 'various') {
    // Redirect to artists page instead of showing Various artist page
    return <Navigate to="/artists" replace />;
  }
  
  // For all other artists, show the normal artist detail page
  return <ArtistDetailPage />;
}


function App() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="min-h-screen bg-background">
      <Navigation searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      
      <main className="pt-28">
        <Routes>
          <Route path="/" element={<AlbumsPage searchTerm={searchTerm} />} />
          <Route path="/albums" element={<AlbumsPage searchTerm={searchTerm} />} />
          <Route path="/albums/:page" element={<AlbumsPage searchTerm={searchTerm} />} />
          <Route path="/artists" element={<ArtistsPage searchTerm={searchTerm} />} />
          <Route path="/artists/:page" element={<ArtistsPage searchTerm={searchTerm} />} />
          <Route path="/artist/:artistPath" element={<ArtistRouteHandler />} />
          <Route path="/album/:albumPath" element={<AlbumDetailPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/genres" element={<GenrePage />} />
          <Route path="/random" element={<RandomPage />} />
          <Route path="/search" element={<SearchResultsPage searchTerm={searchTerm} setSearchTerm={searchTerm} />} />
        </Routes>
      </main>

      <footer className="bg-muted mt-16 py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2025 Russ.fm. A personal record collection showcase.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;