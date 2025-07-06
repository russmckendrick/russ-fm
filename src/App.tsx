import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Navigation } from '@/components/Navigation';
import { AlbumsPage } from '@/pages/AlbumsPage';
import { ArtistsPage } from '@/pages/ArtistsPage';
import { ArtistDetailPage } from '@/pages/ArtistDetailPage';
import { AlbumDetailPage } from '@/pages/AlbumDetailPage';
import { StatsPage } from '@/pages/StatsPage';

function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [cameFromStats, setCameFromStats] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect to albums page when searching from stats page
  useEffect(() => {
    if (searchTerm.trim() && location.pathname === '/stats') {
      setCameFromStats(true);
      navigate('/albums/1');
    } else if (!searchTerm.trim() && cameFromStats && location.pathname.startsWith('/albums')) {
      setCameFromStats(false);
      navigate('/stats');
    }
  }, [searchTerm, location.pathname, navigate, cameFromStats]);

  return (
    <div className="min-h-screen bg-background">
      <Navigation searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      
      <main className="pt-28">
        <Routes>
          <Route path="/" element={<AlbumsPage searchTerm={searchTerm} />} />
          <Route path="/albums/:page?" element={<AlbumsPage searchTerm={searchTerm} />} />
          <Route path="/artists" element={<ArtistsPage searchTerm={searchTerm} />} />
          <Route path="/artists/:page" element={<ArtistsPage searchTerm={searchTerm} />} />
          <Route path="/artist/:artistPath" element={<ArtistDetailPage />} />
          <Route path="/album/:albumPath" element={<AlbumDetailPage />} />
          <Route path="/stats" element={<StatsPage />} />
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