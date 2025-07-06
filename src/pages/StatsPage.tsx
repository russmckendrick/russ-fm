import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { usePageTitle } from '@/hooks/usePageTitle';
import { 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  LineChart, 
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { Calendar, Disc, Music, TrendingUp, Users, Clock } from 'lucide-react';
import { filterGenres } from '@/lib/filterGenres';

interface Album {
  release_name: string;
  release_artist: string;
  genre_names: string[];
  uri_release: string;
  uri_artist: string;
  date_added: string;
  date_release_year: string;
}

export function StatsPage() {
  const [collection, setCollection] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>({});

  usePageTitle('Collection Statistics | Russ.fm');

  useEffect(() => {
    loadCollection();
  }, []);

  const loadCollection = async () => {
    try {
      const response = await fetch('/collection.json');
      const data = await response.json();
      setCollection(data);
      calculateStats(data);
      setLoading(false);
    } catch (error) {
      console.error('Error loading collection:', error);
      setLoading(false);
    }
  };

  const calculateStats = (data: Album[]) => {
    // Basic counts
    const totalAlbums = data.length;
    const uniqueArtists = new Set(data.map(album => album.release_artist)).size;
    const allFilteredGenres = data.flatMap(album => 
      filterGenres(album.genre_names, album.release_artist)
    );
    const uniqueGenres = new Set(allFilteredGenres).size;

    // Artists with most albums (excluding "Various")
    const artistCounts = data.reduce((acc: any, album) => {
      if (album.release_artist.toLowerCase() !== 'various') {
        acc[album.release_artist] = (acc[album.release_artist] || 0) + 1;
      }
      return acc;
    }, {});
    const topArtists = Object.entries(artistCounts)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 9)
      .map(([name, count]) => {
        // Get artist image and URI from the first album by this artist
        const artistAlbum = data.find(album => album.release_artist === name);
        return { 
          name, 
          count, 
          image: artistAlbum?.images_uri_artist?.medium || '',
          uri: artistAlbum?.uri_artist || ''
        };
      });

    // Genre distribution - filter out non-genre terms
    const genreCounts = allFilteredGenres.reduce((acc: any, genre) => {
      acc[genre] = (acc[genre] || 0) + 1;
      return acc;
    }, {});
    const topGenres = Object.entries(genreCounts)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 10)
      .map(([name, count]) => ({ name, value: count }));

    // Albums by decade
    const decadeCounts = data.reduce((acc: any, album) => {
      const year = new Date(album.date_release_year).getFullYear();
      const decade = Math.floor(year / 10) * 10;
      const decadeLabel = `${decade}s`;
      // Exclude 1900s and 1950s
      if (decade >= 1960) {
        acc[decadeLabel] = (acc[decadeLabel] || 0) + 1;
      }
      return acc;
    }, {});
    const decadeData = Object.entries(decadeCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([decade, count]) => ({ decade, count }));

    // Additions per month
    const additionsPerMonth = data.reduce((acc: any, album) => {
      const date = new Date(album.date_added);
      const monthYear = `${date.getMonth() + 1}/${date.getFullYear()}`;
      acc[monthYear] = (acc[monthYear] || 0) + 1;
      return acc;
    }, {});
    
    const additionsData = Object.entries(additionsPerMonth)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => {
        const [monthA, yearA] = a.month.split('/').map(Number);
        const [monthB, yearB] = b.month.split('/').map(Number);
        return yearA - yearB || monthA - monthB;
      });

    // Find oldest and newest albums
    const sortedByYear = [...data].sort((a, b) => 
      new Date(a.date_release_year).getTime() - new Date(b.date_release_year).getTime()
    );
    const oldestAlbum = sortedByYear[0];
    const newestAlbum = sortedByYear[sortedByYear.length - 1];

    // Recent additions
    const recentAdditions = [...data]
      .sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())
      .slice(0, 9);

    // Oldest additions
    const oldestAdditions = [...data]
      .sort((a, b) => new Date(a.date_added).getTime() - new Date(b.date_added).getTime())
      .slice(0, 9);

    setStats({
      totalAlbums,
      uniqueArtists,
      uniqueGenres,
      avgAlbumsPerArtist: (totalAlbums / uniqueArtists).toFixed(1),
      topArtists,
      topGenres,
      decadeData,
      additionsData,
      oldestAlbum,
      newestAlbum,
      recentAdditions,
      oldestAdditions
    });
  };

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#EC4899', '#84CC16', '#6366F1'];

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading statistics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
        <TrendingUp className="h-8 w-8" />
        Collection Statistics
      </h1>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Albums</CardTitle>
            <Disc className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalAlbums}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Artists</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.uniqueArtists}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Genres</CardTitle>
            <Music className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.uniqueGenres}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Albums/Artist</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgAlbumsPerArtist}</div>
          </CardContent>
        </Card>
      </div>

      {/* Top Artists */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">Artists with Most Albums</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.topArtists?.slice(0, 9).map((artist: any, index: number) => (
            <Link
              key={index}
              to={artist.uri}
              className="block"
            >
              <Card className="hover:shadow-lg transition-all duration-300 hover:scale-105">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={artist.image} alt={artist.name} />
                      <AvatarFallback className="text-sm">
                        {artist.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{artist.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary">{artist.count} albums</Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Additions */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">Recent Additions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.recentAdditions?.map((album: Album, index: number) => (
            <Link
              key={index}
              to={album.uri_release}
              className="block"
            >
              <Card className="hover:shadow-lg transition-all duration-300 hover:scale-105">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-lg overflow-hidden flex-shrink-0">
                      <img
                        src={album.images_uri_release?.small || album.images_uri_release?.medium || album.images_uri_release?.['hi-res']}
                        alt={album.release_name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = album.images_uri_release?.medium || album.images_uri_release?.['hi-res'] || '';
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{album.release_name}</p>
                      <p className="text-sm text-muted-foreground truncate">{album.release_artist}</p>
                      <p className="text-xs text-muted-foreground">
                        Added: {new Date(album.date_added).toLocaleDateString('en-GB', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          year: 'numeric' 
                        })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Albums by Decade */}
        <Card>
          <CardHeader>
            <CardTitle>Albums by Decade</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.decadeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="decade" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Genres */}
        <Card>
          <CardHeader>
            <CardTitle>Genres</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={stats.topGenres}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={90}
                      innerRadius={45}
                      fill="#8884d8"
                      dataKey="value"
                      stroke="white"
                      strokeWidth={2}
                    >
                      {stats.topGenres?.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value, name) => [`${value} albums`, name]}
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: 'none',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              
              {/* Compact Legend */}
              <div className="w-48 space-y-2 text-sm">
                {stats.topGenres?.slice(0, 8).map((entry: any, index: number) => (
                  <div key={index} className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="truncate font-medium capitalize">
                      {entry.name} ({((entry.value / stats.totalAlbums) * 100).toFixed(0)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Collection Growth */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Additions Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats.additionsData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Oldest Additions */}
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Clock className="h-6 w-6" />
          Oldest Additions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.oldestAdditions?.map((album: Album, index: number) => (
            <Link
              key={index}
              to={album.uri_release}
              className="block"
            >
              <Card className="hover:shadow-lg transition-all duration-300 hover:scale-105">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-lg overflow-hidden flex-shrink-0">
                      <img
                        src={album.images_uri_release?.small || album.images_uri_release?.medium || album.images_uri_release?.['hi-res']}
                        alt={album.release_name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = album.images_uri_release?.medium || album.images_uri_release?.['hi-res'] || '';
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{album.release_name}</p>
                      <p className="text-sm text-muted-foreground truncate">{album.release_artist}</p>
                      <p className="text-xs text-muted-foreground">
                        Added: {new Date(album.date_added).toLocaleDateString('en-GB', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          year: 'numeric' 
                        })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}