import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Navigation } from './components/Navigation';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { AlbumsPage } from './pages/AlbumsPage';
import { ArtistsPage } from './pages/ArtistsPage';
import { ArtistDetailPage } from './pages/ArtistDetailPage';
import { AlbumDetailPage } from './pages/AlbumDetailPage';
import { StatsPage } from './pages/StatsPage';
import { SearchResultsPage } from './pages/SearchResultsPage';
import { RandomPage } from './pages/RandomPage';
import { GenrePage } from './pages/GenrePage';
import { WrappedYear } from './pages/wrapped/WrappedYear';
import { WrappedYTD } from './pages/wrapped/WrappedYTD';

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
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="pt-0 md:pt-32 pb-16">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/albums" element={<AlbumsPage />} />
          <Route path="/albums/:page" element={<AlbumsPage />} />
          <Route path="/artists" element={<ArtistsPage />} />
          <Route path="/artists/:page" element={<ArtistsPage />} />
          <Route path="/artist/:artistPath" element={<ArtistRouteHandler />} />
          <Route path="/album/:albumPath" element={<AlbumDetailPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/genres" element={<GenrePage />} />
          <Route path="/random" element={<RandomPage />} />
          <Route path="/search" element={<SearchResultsPage />} />
          <Route path="/wrapped" element={<Navigate to={`/wrapped/${new Date().getFullYear() - 1}`} replace />} />
          <Route path="/wrapped/ytd" element={<WrappedYTD />} />
          <Route path="/wrapped/:year" element={<WrappedYear />} />
        </Routes>
      </main>

      <Footer />
    </div>
  );
}

export default App;