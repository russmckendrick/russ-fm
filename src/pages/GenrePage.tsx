import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as d3 from 'd3';
import { getCleanGenresFromArray } from '@/lib/genreUtils';

interface Album {
  release_name: string;
  release_artist: string;
  artists: {
    name: string;
    uri_artist: string;
    images_uri_artist?: {
      small?: string;
    };
  }[];
  genre_names: string[];
}

interface GenreArtistData {
  genre: string;
  albumCount: number;
  topArtists: {
    name: string;
    slug: string;
    albumCount: number;
    avatar: string;
  }[];
}

interface MindMapNode {
  id: string;
  type: 'genre' | 'artist';
  name: string;
  genre?: string;
  albumCount: number;
  avatar?: string;
  slug?: string;
  x?: number;
  y?: number;
}

interface MindMapLink {
  source: string;
  target: string;
}

export function GenrePage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusedGenre, setFocusedGenre] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch('/collection.json');
        if (!response.ok) {
          throw new Error('Failed to load collection data');
        }
        const data = await response.json();
        setAlbums(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Process data to create genre -> top artists mapping
  const genreArtistData = useMemo((): GenreArtistData[] => {
    if (!albums.length) return [];

    // Map to track genre -> artist -> album count
    const genreArtistCounts = new Map<string, Map<string, { count: number; artist: Album['artists'][0] }>>();
    const globalArtistUsage = new Map<string, number>(); // Track how many times each artist is used

    albums.forEach((album) => {
      const genres = getCleanGenresFromArray(album.genre_names || [], album.release_artist);
      
      album.artists.forEach((artist) => {
        // Skip "Various" artists
        if (artist.name.toLowerCase().includes('various')) return;
        
        genres.forEach((genre) => {
          const cleanGenre = genre.trim();
          if (cleanGenre && cleanGenre.length > 1) {
            if (!genreArtistCounts.has(cleanGenre)) {
              genreArtistCounts.set(cleanGenre, new Map());
            }
            
            const artistMap = genreArtistCounts.get(cleanGenre)!;
            const existing = artistMap.get(artist.name) || { count: 0, artist };
            artistMap.set(artist.name, { count: existing.count + 1, artist });
          }
        });
      });
    });

    // Convert to final format, ensuring no artist appears twice
    const usedArtists = new Set<string>();
    const sortedGenres = Array.from(genreArtistCounts.entries())
      .filter(([, artistMap]) => artistMap.size > 0)
      .map(([genre, artistMap]) => ({
        genre,
        albumCount: Array.from(artistMap.values()).reduce((sum, data) => sum + data.count, 0),
        artistMap
      }))
      .sort((a, b) => b.albumCount - a.albumCount)
      .slice(0, 8);
    
    return sortedGenres.map((genreData, index) => {
      // If this genre is focused, show MANY more artists, otherwise normal amounts
      const isFocused = focusedGenre === genreData.genre;
      const maxArtists = isFocused ? 50 : (index === 0 ? 12 : index < 3 ? 8 : 6);
      
      const sortedArtists = Array.from(genreData.artistMap.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .filter(([name]) => !usedArtists.has(name) || isFocused) // Allow reuse for focused genre
        .slice(0, maxArtists);

      // Mark these artists as used (except for focused genre to allow more artists)
      if (!isFocused) {
        sortedArtists.forEach(([name]) => usedArtists.add(name));
      }

      const topArtists = sortedArtists.map(([name, data]) => ({
        name,
        slug: data.artist.uri_artist.replace('/artist/', '').replace('/', ''),
        albumCount: data.count,
        avatar: data.artist.images_uri_artist?.small || `/artist/${data.artist.uri_artist.replace('/artist/', '').replace('/', '')}/${data.artist.uri_artist.replace('/artist/', '').replace('/', '')}-small.jpg`
      }));

      return {
        genre: genreData.genre,
        albumCount: genreData.albumCount,
        topArtists
      };
    });
  }, [albums, focusedGenre]);

  // Create D3 visualization
  useEffect(() => {
    if (!genreArtistData.length || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous render

    // Get container dimensions dynamically
    const container = svgRef.current.parentElement;
    const width = container?.clientWidth || 1200;
    const height = container?.clientHeight || 800;
    const centerX = width / 2;
    const centerY = height / 2;

    svg.attr('viewBox', `0 0 ${width} ${height}`)
       .attr('width', '100%')
       .attr('height', '100%')
       .on('click', () => {
         // Click on background to unfocus
         if (focusedGenre) {
           setFocusedGenre(null);
         }
       });

    // Create nodes and links
    const nodes: MindMapNode[] = [];
    const links: MindMapLink[] = [];

    // Place genres strategically across the space with much better spacing
    const genrePositions = [
      // Center area
      { x: 0, y: 0 },           // Dead center
      { x: 0.9, y: 0 },         // Far right
      { x: -0.9, y: 0 },        // Far left
      // Upper area
      { x: 0, y: -0.8 },        // Top center
      { x: 0.7, y: -0.6 },      // Top right
      { x: -0.7, y: -0.6 },     // Top left
      // Lower area
      { x: 0, y: 0.8 },         // Bottom center
      { x: 0.7, y: 0.6 },       // Bottom right
    ];
    
    genreArtistData.forEach((genreData, i) => {
      const isFocused = focusedGenre === genreData.genre;
      const pos = genrePositions[i] || { x: 0, y: 0 };
      
      // If something is focused and this isn't it, skip this genre entirely
      if (focusedGenre && !isFocused) {
        return;
      }
      
      // Position logic
      let genreX, genreY;
      if (isFocused || focusedGenre === genreData.genre) {
        genreX = centerX;
        genreY = centerY;
      } else {
        // Normal positioning
        genreX = centerX + pos.x * Math.min(width, height) * 0.3;
        genreY = centerY + pos.y * Math.min(width, height) * 0.3;
      }
      
      const genreNode: MindMapNode = {
        id: `genre-${genreData.genre}`,
        type: 'genre',
        name: genreData.genre,
        albumCount: genreData.albumCount,
        x: genreX,
        y: genreY,
      };
      nodes.push(genreNode);

      // Adjust cluster based on focus state
      const artistCount = genreData.topArtists.length;
      const clusterRadius = isFocused ? 200 : 120;
      
      genreData.topArtists.forEach((artist, j) => {
        let angle, radius;
        
        if (isFocused) {
          // Spread artists in multiple rings for focused genre
          const ring = Math.floor(j / 8); // 8 artists per ring
          const angleInRing = (j % 8) / 8 * 2 * Math.PI;
          angle = angleInRing;
          radius = clusterRadius + (ring * 80) + (Math.random() - 0.5) * 30;
        } else {
          // Normal circular arrangement
          angle = (j / artistCount) * 2 * Math.PI;
          radius = clusterRadius + (Math.random() - 0.5) * 20;
        }
        
        const artistNode: MindMapNode = {
          id: `artist-${artist.slug}`,
          type: 'artist',
          name: artist.name,
          genre: genreData.genre,
          albumCount: artist.albumCount,
          avatar: artist.avatar,
          slug: artist.slug,
          x: genreNode.x! + Math.cos(angle) * radius,
          y: genreNode.y! + Math.sin(angle) * radius,
        };
        nodes.push(artistNode);

        // Create link between genre and artist
        links.push({
          source: genreNode.id,
          target: artistNode.id
        });
      });
    });

    // Gentle force simulation to maintain clusters with no overlap
    const simulation = d3.forceSimulation(nodes as any)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(120).strength(0.7))
      .force('charge', d3.forceManyBody().strength(-80)) // Gentle repulsion
      .force('collision', d3.forceCollide().radius(40)) // Larger collision radius
      .force('boundary', () => {
        // Keep nodes within viewport bounds
        const margin = 100;
        nodes.forEach((node: any) => {
          node.x = Math.max(margin, Math.min(width - margin, node.x));
          node.y = Math.max(margin, Math.min(height - margin, node.y));
        });
      })
      .alphaDecay(0.06) // Settle slower for better positioning
      .velocityDecay(0.8); // More damping

    // Create links with straight lines
    const linkGroup = svg.append('g').attr('class', 'links');
    const linkElements = linkGroup.selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', '#64748b')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', (d: any) => {
        if (!focusedGenre) return 0.3;
        const sourceNode = nodes.find(n => n.id === d.source);
        return sourceNode?.genre === focusedGenre ? 0.6 : 0.1;
      });

    // Create genre nodes
    const genreGroup = svg.append('g').attr('class', 'genres');
    const genreNodes = genreGroup.selectAll('g')
      .data(nodes.filter(n => n.type === 'genre'))
      .enter().append('g')
      .style('cursor', 'pointer')
      .on('click', (event, d: any) => {
        event.stopPropagation();
        if (focusedGenre === d.name) {
          // If already focused, unfocus
          setFocusedGenre(null);
        } else {
          // Focus this genre
          setFocusedGenre(d.name);
        }
      })
      .call(d3.drag<any, any>()
        .on('start', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d: any) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }));

    genreNodes.append('circle')
      .attr('r', d => Math.max(35, Math.min(55, d.albumCount * 1.5)))
      .attr('fill', (d, i) => d3.schemeSet3[i % d3.schemeSet3.length])
      .attr('stroke', '#fff')
      .attr('stroke-width', 3)
      .style('filter', 'drop-shadow(2px 2px 4px rgba(0,0,0,0.2))')
      .style('opacity', (d: any) => {
        if (!focusedGenre) return 1;
        return focusedGenre === d.name ? 1 : 0.3;
      });

    // Add wrapped text for genre names
    genreNodes.each(function(d: any) {
      const node = d3.select(this);
      const words = d.name.split(/[\s,&]+/); // Split on spaces, commas, and ampersands
      const lineHeight = 12;
      const maxWidth = 80; // Maximum width for text
      
      if (words.length <= 2) {
        // Short names - single or two words
        if (words.length === 1) {
          node.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', 4)
            .style('fill', '#1f2937')
            .style('font-weight', 'bold')
            .style('font-size', '11px')
            .text(d.name);
        } else {
          // Two words - put each on its own line
          node.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', -2)
            .style('fill', '#1f2937')
            .style('font-weight', 'bold')
            .style('font-size', '11px')
            .text(words[0]);
          
          node.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', 10)
            .style('fill', '#1f2937')
            .style('font-weight', 'bold')
            .style('font-size', '11px')
            .text(words.slice(1).join(' '));
        }
      } else {
        // Long names - wrap intelligently
        const lines: string[] = [];
        let currentLine = '';
        
        words.forEach(word => {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          if (testLine.length > 8 && currentLine) { // Rough character limit
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        });
        if (currentLine) lines.push(currentLine);
        
        // Add text lines
        lines.forEach((line, i) => {
          node.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', (i - (lines.length - 1) / 2) * lineHeight + 4)
            .style('fill', '#1f2937')
            .style('font-weight', 'bold')
            .style('font-size', '10px')
            .text(line);
        });
      }
    });

    // Create artist nodes with avatars
    const artistGroup = svg.append('g').attr('class', 'artists');
    const artistNodes = artistGroup.selectAll('g')
      .data(nodes.filter(n => n.type === 'artist'))
      .enter().append('g')
      .style('cursor', 'pointer')
      .attr('data-hovered', 'false')
      .call(d3.drag<any, any>()
        .on('start', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d: any) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }))
      .on('click', (event, d) => {
        if (d.slug) {
          navigate(`/artist/${d.slug}`);
        }
      });

    // Artist avatar border (no fill, just stroke for definition)
    artistNodes.append('circle')
      .attr('r', 28)
      .attr('fill', 'none')
      .attr('stroke', '#64748b')
      .attr('stroke-width', 2)
      .style('filter', 'drop-shadow(1px 1px 3px rgba(0,0,0,0.3))')
      .style('opacity', (d: any) => {
        if (!focusedGenre) return 1;
        return d.genre === focusedGenre ? 1 : 0.2;
      });

    // Artist avatar images - create circular clipping mask
    artistNodes.append('defs').append('clipPath')
      .attr('id', (d, i) => `clip-${d.slug}`)
      .append('circle')
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('r', 28);

    artistNodes.append('image')
      .attr('href', d => d.avatar || '')
      .attr('x', -35)
      .attr('y', -35)
      .attr('width', 70)
      .attr('height', 70)
      .attr('clip-path', (d, i) => `url(#clip-${d.slug})`)
      .attr('preserveAspectRatio', 'xMidYMid slice')
      .style('opacity', (d: any) => {
        if (!focusedGenre) return 1;
        return d.genre === focusedGenre ? 1 : 0.2;
      })
      .on('error', function() {
        // For failed images, add a gray background circle
        d3.select(this.parentNode)
          .append('circle')
          .attr('r', 28)
          .attr('fill', '#e2e8f0')
          .attr('stroke', '#64748b')
          .attr('stroke-width', 2);
      });

    // No artist labels - cleaner look

    // Simple hover effects - just scale the entire node
    artistNodes
      .on('mouseenter', function(event, d) {
        d3.select(this).attr('data-hovered', 'true');
        d3.select(this)
          .transition()
          .duration(200)
          .attr('transform', `translate(${d.x},${d.y}) scale(1.15)`);
        
        d3.select(this).select('circle')
          .transition()
          .duration(200)
          .attr('stroke', '#3b82f6')
          .attr('stroke-width', 3);
      })
      .on('mouseleave', function(event, d) {
        d3.select(this).attr('data-hovered', 'false');
        d3.select(this)
          .transition()
          .duration(200)
          .attr('transform', `translate(${d.x},${d.y}) scale(1)`);
        
        d3.select(this).select('circle')
          .transition()
          .duration(200)
          .attr('stroke', '#64748b')
          .attr('stroke-width', 2);
      });

    // Update positions on simulation tick
    simulation.on('tick', () => {
      // Update link positions with straight lines
      linkElements
        .attr('x1', (d: any) => {
          const source = nodes.find(n => n.id === d.source.id);
          return source?.x || 0;
        })
        .attr('y1', (d: any) => {
          const source = nodes.find(n => n.id === d.source.id);
          return source?.y || 0;
        })
        .attr('x2', (d: any) => {
          const target = nodes.find(n => n.id === d.target.id);
          return target?.x || 0;
        })
        .attr('y2', (d: any) => {
          const target = nodes.find(n => n.id === d.target.id);
          return target?.y || 0;
        });

      // Update node positions
      genreNodes.attr('transform', d => `translate(${d.x},${d.y})`);
      artistNodes.attr('transform', function(d: any) {
        const isHovered = d3.select(this).attr('data-hovered') === 'true';
        const scale = isHovered ? 'scale(1.15)' : 'scale(1)';
        return `translate(${d.x},${d.y}) ${scale}`;
      });
    });

  }, [genreArtistData, navigate, focusedGenre]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-lg">Loading genre mind map...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-lg text-destructive">Error: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-4">
      <div className="bg-card rounded-lg border p-4">
        {genreArtistData.length > 0 ? (
          <div className="w-full h-[85vh] flex justify-center">
            <svg ref={svgRef} className="w-full h-full" />
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No genre data available</p>
          </div>
        )}
      </div>
    </div>
  );
}