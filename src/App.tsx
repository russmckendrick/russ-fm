import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Navigation } from './components/Navigation';
import { Footer } from './components/Footer';
import { TweaksPanel } from './components/TweaksPanel';
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
import { BrowseIndexPage } from './pages/browse/BrowseIndexPage';
import { FacetListPage } from './pages/browse/FacetListPage';
import { FacetDetailPage } from './pages/browse/FacetDetailPage';

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
    <div className="min-h-screen bg-background font-grot">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:border focus:border-ink focus:bg-paper focus:px-4 focus:py-2 focus:font-mono focus:text-[11px] focus:uppercase focus:tracking-[0.08em] focus:text-ink"
      >
        Skip to main content
      </a>
      <Navigation />

      <main id="main-content" className="pb-16">
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
          <Route path="/browse" element={<BrowseIndexPage />} />
          <Route path="/labels" element={<FacetListPage facetKey="label" />} />
          <Route path="/label/:slug" element={<FacetDetailPage facetKey="label" />} />
          <Route path="/decades" element={<FacetListPage facetKey="decade" />} />
          <Route path="/decade/:slug" element={<FacetDetailPage facetKey="decade" />} />
          <Route path="/countries" element={<FacetListPage facetKey="country" />} />
          <Route path="/country/:slug" element={<FacetDetailPage facetKey="country" />} />
          <Route path="/genre/:slug" element={<FacetDetailPage facetKey="genre" />} />
          <Route path="/random" element={<RandomPage />} />
          <Route path="/search" element={<SearchResultsPage />} />
          <Route path="/wrapped" element={<Navigate to={`/wrapped/${new Date().getFullYear() - 1}`} replace />} />
          <Route path="/wrapped/ytd" element={<WrappedYTD />} />
          <Route path="/wrapped/:year" element={<WrappedYear />} />
        </Routes>
      </main>

      <Footer />

      {/* Dev-only: Cmd/Ctrl+Shift+D to open */}
      <TweaksPanel />
    </div>
  );
}

export default App;
