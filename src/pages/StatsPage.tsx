import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlbumCard } from '@/components/AlbumCard';
import { ArtistCard } from '@/components/ArtistCard';
import { CollectionStats as CollectionStatsOverview } from '@/components/CollectionStats';
import { PageContainer } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { MetadataBadge } from '@/components/ui/metadata-badge';
import { GenreTag } from '@/components/ui/genre-tag';
import {
    BarChart,
    Bar,
    PieChart,
    Pie,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from 'recharts';
import { Disc, TrendingUp, Users, Clock, Award } from 'lucide-react';
import { getCleanGenresFromArray } from '@/lib/genreUtils';
import { getArtistImageFromData, getAlbumImageFromData } from '@/lib/image-utils';
import { appConfig } from '@/config/app.config';
import { Album } from '@/types/album';
import { cn } from '@/lib/utils';

interface ColorPalette {
    background: string;
    foreground: string;
    accent: string;
    muted: string;
}

interface ArtistStat {
    name: string;
    uri: string;
    albums: Album[];
    albumCount: number;
    genres: string[];
    image: string;
    latestAlbum: string;
    biography?: string;
}

interface GenreStat {
    name: string;
    value: number;
    [key: string]: any;
}

interface DecadeStat {
    decade: string;
    count: number;
    [key: string]: any;
}

interface AdditionStat {
    month: string;
    count: number;
    [key: string]: any;
}

interface YearStat {
    year: string;
    count: number;
    [key: string]: any;
}

export interface CollectionStats {
    totalAlbums: number;
    uniqueArtists: number;
    uniqueGenres: number;
    avgAlbumsPerArtist: string;
    topArtists: ArtistStat[];
    topGenres: GenreStat[];
    decadeData: DecadeStat[];
    additionsData: AdditionStat[];
    oldestAlbum: Album | null;
    newestAlbum: Album | null;
    recentAdditions: Album[];
    randomAlbums: Album[];
    randomArtists: ArtistStat[];
    // New Stats
    goldenYear: { year: string; count: number } | null;
    topYears: YearStat[];
    oneHitWonders: number;
    catalogArtists: number;
    mostActiveMonth: { month: string; count: number } | null;
}

// Charts Section Component with animations
function ChartsSection({ stats, COLORS }: { stats: CollectionStats; COLORS: string[] }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: "-100px" });

    return (
        <div ref={ref} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Albums by Decade */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                transition={{ duration: 0.6 }}
            >
                <Card className="glass-panel border-white/10 h-full overflow-hidden">
                    <CardHeader>
                        <CardTitle className="text-xl font-light">Albums by Decade</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={stats.decadeData}>
                                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                                <XAxis dataKey="decade" />
                                <YAxis />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'hsl(var(--card))',
                                        border: '1px solid hsl(var(--border))',
                                        borderRadius: '8px',
                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                    }}
                                    cursor={{ fill: 'hsl(var(--muted)/0.2)' }}
                                />
                                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                                    {stats.decadeData?.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Top Genres */}
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
                transition={{ duration: 0.6 }}
            >
                <Card className="glass-panel border-white/10 h-full overflow-hidden">
                    <CardHeader>
                        <CardTitle className="text-xl font-light">Top Genres</CardTitle>
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
                                            outerRadius={100}
                                            innerRadius={50}
                                            dataKey="value"
                                            stroke="hsl(var(--background))"
                                            strokeWidth={2}
                                        >
                                            {stats.topGenres?.map((_, index: number) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value, name) => [`${value} albums`, name]}
                                            contentStyle={{
                                                backgroundColor: 'hsl(var(--card))',
                                                border: '1px solid hsl(var(--border))',
                                                borderRadius: '8px',
                                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Compact Legend */}
                            <div className="w-48 space-y-2 text-sm">
                                {stats.topGenres?.slice(0, 8).map((entry: GenreStat, index: number) => (
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
            </motion.div>
        </div>
    );
}

// Top Artists Section Component with stagger animations
function TopArtistsSection({ stats }: { stats: CollectionStats }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: "-100px" });

    return (
        <motion.section
            ref={ref}
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
        >
            <motion.h2
                className="text-3xl font-light mb-6"
                initial={{ opacity: 0, x: -20 }}
                animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                transition={{ delay: 0.2 }}
            >
                Artists with Most Albums
            </motion.h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                {stats.topArtists?.slice(0, 8).map((artist: ArtistStat, index: number) => (
                    <motion.div
                        key={artist.uri}
                        initial={{ opacity: 0, y: 20 }}
                        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                        transition={{ delay: 0.3 + index * 0.08, duration: 0.5 }}
                        className="h-full"
                    >
                        <ArtistCard artist={artist} />
                    </motion.div>
                ))}
            </div>
        </motion.section>
    );
}

// Recent Additions Section Component
function RecentAdditionsSection({ stats }: { stats: CollectionStats }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: "-100px" });

    return (
        <motion.section
            ref={ref}
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
        >
            <motion.h2
                className="text-3xl font-light mb-6"
                initial={{ opacity: 0, x: -20 }}
                animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                transition={{ delay: 0.2 }}
            >
                Recent Additions
            </motion.h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {stats.recentAdditions?.map((album: Album, index: number) => (
                    <motion.div
                        key={album.uri_release}
                        initial={{ opacity: 0, y: 20 }}
                        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                        transition={{ delay: 0.3 + index * 0.08, duration: 0.5 }}
                        className="h-full"
                    >
                        <AlbumCard album={album} />
                    </motion.div>
                ))}
            </div>
        </motion.section>
    );
}

// Collection Growth Section Component
function CollectionGrowthSection({ stats }: { stats: CollectionStats }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: "-100px" });
    const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#EC4899', '#84CC16', '#6366F1'];

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
        >
            <Card className="glass-panel border-white/10">
                <CardHeader>
                    <CardTitle className="text-2xl font-light">Additions Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={stats.additionsData}>
                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                            <XAxis dataKey="month" />
                            <YAxis />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'hsl(var(--card))',
                                    border: '1px solid hsl(var(--border))',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                }}
                                cursor={{ fill: 'hsl(var(--muted)/0.2)' }}
                            />
                            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                                {stats.additionsData?.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </motion.div>
    );
}

// Golden Year Section
function GoldenYearSection({ stats }: { stats: CollectionStats }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: "-100px" });

    if (!stats.goldenYear) return null;

    return (
        <motion.section
            ref={ref}
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="glass-panel bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/20">
                    <CardHeader>
                        <CardTitle className="text-xl font-light flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-amber-500" />
                            Golden Year
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                            <span className="text-8xl font-bold text-foreground/90 tracking-tighter">
                                {stats.goldenYear.year}
                            </span>
                            <p className="text-muted-foreground mt-2">
                                Most prolific year with <span className="font-semibold text-foreground">{stats.goldenYear.count}</span> albums released
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass-panel border-white/10">
                    <CardHeader>
                        <CardTitle className="text-xl font-light">Top 5 Release Years</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {stats.topYears?.map((item, index) => (
                                <div key={item.year} className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="font-medium">{item.year}</span>
                                        <span className="text-muted-foreground">{item.count} albums</span>
                                    </div>
                                    <div className="h-2 bg-secondary/30 rounded-full overflow-hidden">
                                        <motion.div
                                            className="h-full bg-primary/80"
                                            initial={{ width: 0 }}
                                            animate={inView ? { width: `${(item.count / (stats.goldenYear?.count || 1)) * 100}%` } : { width: 0 }}
                                            transition={{ duration: 1, delay: 0.5 + (index * 0.1) }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </motion.section>
    );
}

// Artist Depth Section
function ArtistDepthSection({ stats }: { stats: CollectionStats }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: "-100px" });

    return (
        <motion.section
            ref={ref}
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
        >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="glass-panel border-white/10">
                    <CardHeader>
                        <CardTitle className="text-lg font-light flex items-center gap-2">
                            <Users className="h-5 w-5 text-blue-500" />
                            Artist Depth
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium">One Hit Wonders</span>
                                <Badge variant="secondary">{stats.oneHitWonders}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">Artists with only 1 album in collection</p>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium">Catalog Artists</span>
                                <Badge variant="outline" className="border-primary/50">{stats.catalogArtists}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">Artists with 5+ albums in collection</p>
                        </div>
                    </CardContent>
                </Card>

                {stats.mostActiveMonth && (
                    <Card className="glass-panel border-white/10 md:col-span-2">
                        <CardHeader>
                            <CardTitle className="text-lg font-light flex items-center gap-2">
                                <Clock className="h-5 w-5 text-purple-500" />
                                Most Active Month
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex items-center justify-between">
                            <div className="space-y-1">
                                <p className="text-4xl font-bold">{stats.mostActiveMonth.month}</p>
                                <p className="text-muted-foreground">
                                    You typically add the most music in {stats.mostActiveMonth.month}
                                </p>
                            </div>
                            <div className="text-right">
                                <span className="text-3xl font-bold text-primary">{stats.mostActiveMonth.count}</span>
                                <p className="text-sm text-muted-foreground">Total Additions</p>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </motion.section>
    );
}

// Random Albums Section Component
function RandomAlbumsSection({ stats }: { stats: CollectionStats }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: "-100px" });

    return (
        <motion.section
            ref={ref}
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
        >
            <motion.h2
                className="text-3xl font-light mb-6"
                initial={{ opacity: 0, x: -20 }}
                animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                transition={{ delay: 0.2 }}
            >
                From the Crates
            </motion.h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {stats.randomAlbums?.map((album: Album, index: number) => (
                    <motion.div
                        key={album.uri_release}
                        initial={{ opacity: 0, y: 20 }}
                        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                        transition={{ delay: 0.3 + index * 0.08, duration: 0.5 }}
                        className="h-full"
                    >
                        <AlbumCard album={album} />
                    </motion.div>
                ))}
            </div>
        </motion.section>
    );
}

// Random Artists Section Component
function RandomArtistsSection({ stats }: { stats: CollectionStats }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: "-100px" });

    return (
        <motion.section
            ref={ref}
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
        >
            <motion.h2
                className="text-3xl font-light mb-6"
                initial={{ opacity: 0, x: -20 }}
                animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                transition={{ delay: 0.2 }}
            >
                Random Artists
            </motion.h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                {stats.randomArtists?.map((artist: ArtistStat, index: number) => (
                    <motion.div
                        key={artist.uri || artist.name}
                        initial={{ opacity: 0, y: 20 }}
                        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                        transition={{ delay: 0.3 + index * 0.08, duration: 0.5 }}
                        className="h-full"
                    >
                        <ArtistCard artist={artist} />
                    </motion.div>
                ))}
            </div>
        </motion.section>
    );
}

export function StatsPage() {
    const [, setCollection] = useState<Album[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<CollectionStats>({} as CollectionStats);
    const [headerColors, setHeaderColors] = useState<ColorPalette>({
        background: '#1a1816',
        foreground: '#ffffff',
        accent: '#82a5cc',
        muted: '#6a81a1'
    });
    const [stackOffset, setStackOffset] = useState(0);

    useEffect(() => {
        if (!stats.randomAlbums || stats.randomAlbums.length === 0) return;

        const interval = setInterval(() => {
            setStackOffset(prev => (prev + 1) % stats.randomAlbums.length);
        }, 5000);

        return () => clearInterval(interval);
    }, [stats.randomAlbums]);

    usePageTitle('Collection Statistics | Russ.fm');

    // Set meta tags for social media sharing
    useMetaTags({
        title: 'Collection Statistics | Russ.fm',
        description: stats.totalAlbums
            ? `${stats.totalAlbums} albums across ${stats.uniqueGenres} genres by ${stats.uniqueArtists} artists. Explore my music collection statistics.`
            : 'Explore comprehensive statistics about my vinyl and music collection on Russ.fm',
        image: `${appConfig.siteUrl}/og-image.png`,
        url: `${appConfig.siteUrl}/stats`,
        type: 'website'
    });

    const calculateStats = useCallback((data: Album[]) => {
        // Basic counts
        const totalAlbums = data.length;
        const uniqueArtists = new Set(data.map(album => album.release_artist)).size;
        const allFilteredGenres = data.flatMap(album =>
            getCleanGenresFromArray(album.genre_names, album.release_artist)
        );
        const uniqueGenres = new Set(allFilteredGenres).size;

        // Artists with most albums (excluding "Various")
        const artistCounts = data.reduce((acc: Record<string, number>, album) => {
            if (album.release_artist.toLowerCase() !== 'various') {
                acc[album.release_artist] = (acc[album.release_artist] || 0) + 1;
            }
            return acc;
        }, {});
        const topArtists = Object.entries(artistCounts)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .slice(0, 9)
            .map(([name, count]) => {
                // Get artist image and URI from the first album by this artist
                const artistAlbums = data.filter(album => album.release_artist === name);
                const artistAlbum = artistAlbums[0];
                return {
                    name,
                    uri: artistAlbum?.uri_artist || '',
                    albums: artistAlbums,
                    albumCount: count,
                    genres: artistAlbum?.genre_names || [],
                    image: getArtistImageFromData(artistAlbum?.uri_artist || '', 'medium'),
                    latestAlbum: artistAlbums[0]?.release_name || '',
                    biography: ''
                };
            });

        // Genre distribution - filter out non-genre terms
        const genreCounts = allFilteredGenres.reduce((acc: Record<string, number>, genre) => {
            acc[genre] = (acc[genre] || 0) + 1;
            return acc;
        }, {});
        const topGenres = Object.entries(genreCounts)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .slice(0, 10)
            .map(([name, count]) => ({ name, value: count }));

        // Albums by decade
        const decadeCounts = data.reduce((acc: Record<string, number>, album) => {
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
        const additionsPerMonth = data.reduce((acc: Record<string, number>, album) => {
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
            .slice(0, 10);

        // Random Albums (10 items)
        const randomAlbums = [...data]
            .sort(() => 0.5 - Math.random())
            .slice(0, 10);

        // Random Artists (8 items) - iterate through individual artists from albums
        // Build a map of all unique artists from the artists array (not release_artist string)
        const allArtistsMap = new Map<string, { albums: Album[]; artist: any }>();
        data.forEach(album => {
            album.artists.forEach(artist => {
                // Skip "Various" artists
                if (artist.name.toLowerCase() === 'various') return;

                if (!allArtistsMap.has(artist.name)) {
                    allArtistsMap.set(artist.name, { albums: [album], artist });
                } else {
                    allArtistsMap.get(artist.name)!.albums.push(album);
                }
            });
        });

        const allArtistsList = Array.from(allArtistsMap.entries())
            .map(([name, { albums: artistAlbums, artist }]) => ({
                name,
                uri: artist.uri_artist || '',
                albums: artistAlbums,
                albumCount: artistAlbums.length,
                genres: artistAlbums[0]?.genre_names || [],
                image: artist.uri_artist
                    ? getArtistImageFromData(artist.uri_artist, 'medium')
                    : getAlbumImageFromData(artistAlbums[0]?.uri_release || '', 'medium'),
                latestAlbum: artistAlbums[0]?.release_name || '',
                biography: ''
            }));

        const randomArtists = [...allArtistsList]
            .sort(() => 0.5 - Math.random())
            .slice(0, 8);

        // --- NEW STATS CALCULATIONS ---

        // 1. Golden Year (Year with most releases)
        const yearCounts = data.reduce((acc: Record<string, number>, album) => {
            const year = new Date(album.date_release_year).getFullYear().toString();
            if (year && year !== 'NaN') {
                acc[year] = (acc[year] || 0) + 1;
            }
            return acc;
        }, {});

        const sortedYears = Object.entries(yearCounts)
            .sort(([, a], [, b]) => (b as number) - (a as number));

        const goldenYear = sortedYears.length > 0
            ? { year: sortedYears[0][0], count: sortedYears[0][1] }
            : null;

        // 2. Top 5 Years
        const topYears = sortedYears.slice(0, 5).map(([year, count]) => ({ year, count }));

        // 3. One Hit Wonders vs Catalog Artists
        let oneHitWonders = 0;
        let catalogArtists = 0;

        Object.values(artistCounts).forEach(count => {
            if (count === 1) oneHitWonders++;
            if (count >= 5) catalogArtists++;
        });

        // 4. Most Active Month (for adding music)
        const monthCounts = data.reduce((acc: Record<string, number>, album) => {
            const date = new Date(album.date_added);
            const month = date.toLocaleString('default', { month: 'long' });
            acc[month] = (acc[month] || 0) + 1;
            return acc;
        }, {});

        const sortedMonths = Object.entries(monthCounts)
            .sort(([, a], [, b]) => (b as number) - (a as number));

        const mostActiveMonth = sortedMonths.length > 0
            ? { month: sortedMonths[0][0], count: sortedMonths[0][1] }
            : null;

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
            randomAlbums,
            randomArtists,
            goldenYear,
            topYears,
            oneHitWonders,
            catalogArtists,
            mostActiveMonth
        });
    }, []);

    const loadCollection = useCallback(async () => {
        try {
            const response = await fetch('/collection.json');
            const data = await response.json();
            setCollection(data);
            calculateStats(data);

            // Load album colors and pick a random one for the header
            try {
                const colorsResponse = await fetch('/album-colors.json');
                const colorsData = await colorsResponse.json();
                const colorKeys = Object.keys(colorsData);
                if (colorKeys.length > 0) {
                    const randomKey = colorKeys[Math.floor(Math.random() * colorKeys.length)];
                    setHeaderColors(colorsData[randomKey]);
                }
            } catch (error) {
                console.error('Error loading album colors:', error);
                // Keep default colors
            }

            setLoading(false);
        } catch (error) {
            console.error('Error loading collection:', error);
            setLoading(false);
        }
    }, [calculateStats]);

    useEffect(() => {
        loadCollection();
    }, [loadCollection]);

    const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#EC4899', '#84CC16', '#6366F1'];

    // Generate a stack of 3 albums for the hero visual, cycling through them
    const stackAlbums = stats.randomAlbums ? [
        stats.randomAlbums[(stackOffset) % stats.randomAlbums.length],
        stats.randomAlbums[(stackOffset + 1) % stats.randomAlbums.length],
        stats.randomAlbums[(stackOffset + 2) % stats.randomAlbums.length],
    ].reverse() : [];


    if (loading) {
        return (
            <div className="container mx-auto px-4 py-8">
                <motion.div
                    className="text-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                >
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading statistics...</p>
                </motion.div>
            </div>
        );
    }



    return (
        <PageContainer variant="hero">
            {/* Hero Header Section - Neo-Glass Redesign (Artist/Album Page Style) */}
            <div
                className="relative w-full min-h-[55vh] md:min-h-[39vh] flex items-end justify-center pb-12 pt-28 md:pt-32 px-4 overflow-hidden"
                style={{
                    background: `linear-gradient(135deg, ${headerColors.background} 0%, ${headerColors.muted} 50%, ${headerColors.background} 100%)`
                }}
            >
                {/* Animated Background Effects */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div
                        className="absolute top-0 left-0 w-full h-full opacity-40 mix-blend-overlay"
                        style={{
                            background: `radial-gradient(circle at 20% 30%, ${headerColors.accent} 0%, transparent 50%)`
                        }}
                    />
                    <div
                        className="absolute bottom-0 right-0 w-full h-full opacity-30 mix-blend-overlay"
                        style={{
                            background: `radial-gradient(circle at 80% 80%, ${headerColors.accent} 0%, transparent 50%)`
                        }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
                </div>

                <div className="container mx-auto relative z-10 max-w-6xl">
                    <div className="flex flex-col md:flex-row items-end gap-8 md:gap-20 lg:gap-24">

                        {/* Visual Anchor: Vinyl/Album Stack */}
                        <div className="relative w-56 md:w-64 lg:w-72 aspect-square flex-shrink-0 mx-auto md:mx-0 md:ml-4 group">
                            <div
                                className="absolute -inset-10 rounded-full opacity-20 blur-3xl"
                                style={{ background: headerColors.accent }}
                            />
                            <AnimatePresence mode="popLayout">
                                {stackAlbums.map((album, index) => (
                                    <motion.div
                                        key={album.uri_release}
                                        className={cn(
                                            "absolute inset-0 w-full h-full rounded shadow-2xl transition-all duration-700 ease-out group-hover:scale-105",
                                            index === 0 && "rotate-[-4deg] -translate-x-2 translate-y-1 opacity-80 scale-95 origin-bottom-right z-0",
                                            index === 1 && "rotate-[4deg] translate-x-2 translate-y-1 opacity-90 scale-95 origin-bottom-left z-10",
                                            index === 2 && "rotate-[-1deg] z-20" // Front
                                        )}
                                        initial={{ opacity: 0, scale: 0.8, y: 40, rotate: 0 }}
                                        animate={{
                                            opacity: index === 0 ? 0.8 : index === 1 ? 0.9 : 1,
                                            y: index === 0 ? 4 : 2,
                                            rotate: index === 0 ? -4 : index === 1 ? 4 : -1,
                                            scale: index === 2 ? 1 : 0.95
                                        }}
                                        exit={{ opacity: 0, scale: 0.8, y: -40, rotate: 20 }}
                                        transition={{
                                            type: "spring",
                                            stiffness: 100,
                                            damping: 20,
                                            mass: 1,
                                            opacity: { duration: 0.4 }
                                        }}
                                    >
                                        <img
                                            src={getAlbumImageFromData(album.uri_release, 'hi-res')}
                                            alt="Album in collection"
                                            className="w-full h-full object-cover rounded-xl shadow-2xl border border-white/10"
                                        />
                                        {/* Glossy Overlay */}
                                        <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-white/10 rounded-xl pointer-events-none" />
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>

                        {/* Header Info */}
                        <div className="flex-1 text-center md:text-left space-y-5 pb-2">
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.6 }}
                                className="space-y-4"
                            >
                                <div className="space-y-1">
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.3 }}
                                    >
                                        <Badge variant="secondary" className="px-2.5 py-0.5 text-[9px] tracking-[0.25em] uppercase bg-white/10 text-white/90 border-white/10 backdrop-blur-md mb-2">
                                            Library Insights
                                        </Badge>
                                    </motion.div>
                                    <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-none text-foreground drop-shadow-lg"
                                        style={{ fontFamily: "'Outfit', sans-serif" }}>
                                        Collection <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">Statistics</span>
                                    </h1>
                                </div>

                                <p className="text-lg md:text-xl text-muted-foreground/90 font-light max-w-xl mx-auto md:mx-0 leading-relaxed font-serif italic">
                                    Real-time insights from my listening habits. Exploring {stats.totalAlbums.toLocaleString()} albums
                                    across {stats.uniqueGenres.toLocaleString()} genres.
                                </p>

                                {/* Quick Stats Badges */}
                                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5 pt-1">
                                    <MetadataBadge className="bg-white/5 backdrop-blur-md border-white/10 py-1.5 px-3">
                                        <Disc className="h-3.5 w-3.5 mr-2 text-primary/70" />
                                        {stats.totalAlbums.toLocaleString()} Albums
                                    </MetadataBadge>
                                    <MetadataBadge className="bg-white/5 backdrop-blur-md border-white/10 py-1.5 px-3">
                                        <Users className="h-3.5 w-3.5 mr-2 text-primary/70" />
                                        {stats.uniqueArtists.toLocaleString()} Artists
                                    </MetadataBadge>
                                    <MetadataBadge className="bg-white/5 backdrop-blur-md border-white/10 py-1.5 px-3">
                                        <Award className="h-3.5 w-3.5 mr-2 text-primary/70" />
                                        {stats.uniqueGenres.toLocaleString()} Genres
                                    </MetadataBadge>
                                </div>

                                {/* Top Genre Tags */}
                                <div className="flex flex-wrap items-center justify-center md:justify-start gap-1.5 pt-1 opacity-80">
                                    {stats.topGenres?.slice(0, 4).map((genre, i) => (
                                        <GenreTag key={i} genre={genre.name} size="sm" linkable={false} />
                                    ))}
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="container mx-auto px-4 py-12 space-y-12">
                <CollectionStatsOverview stats={stats} loading={loading} />
                <ChartsSection stats={stats} COLORS={COLORS} />
                <GoldenYearSection stats={stats} />
                <TopArtistsSection stats={stats} />
                <ArtistDepthSection stats={stats} />
                <RecentAdditionsSection stats={stats} />
                <CollectionGrowthSection stats={stats} />
                <RandomAlbumsSection stats={stats} />
                <RandomArtistsSection stats={stats} />
            </div>
        </PageContainer>
    );
}
