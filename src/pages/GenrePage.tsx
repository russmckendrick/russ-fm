import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as d3 from 'd3';
import { getCleanGenresFromArray } from '@/lib/genreUtils';
import { getArtistImageFromData } from '@/lib/image-utils';
import { DossierHero, EditorialEmpty, EditorialSkeleton, PageContainer } from '@/components/layout';
import { redesignConfig } from '@/config/redesign.config';

interface Album {
  release_name: string;
  release_artist: string;
  artists: {
    name: string;
    uri_artist: string;
    images_uri_artist?: {
      avatar?: string;
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
  fx?: number | null;
  fy?: number | null;
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
    // globalArtistUsage variable removed - not used

    albums.forEach((album) => {
      const genres = getCleanGenresFromArray(album.genre_names || [], album.release_artist);
      
      album.artists.forEach((artist) => {
        // Skip "Various" artists
        if (artist.name.toLowerCase().includes('various')) return;
        // Skip Sigur Rós
        if (artist.name.trim().toLowerCase() === 'sigur rós') return;
        
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
      .slice(0, 10);
    
    return sortedGenres.map((genreData, index) => {
      // If this genre is focused, show MANY more artists, otherwise normal amounts
      const isFocused = focusedGenre === genreData.genre;
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      const focusedCount = isMobile ? 40 : 80; // Show more in focused view
      const maxArtists = isFocused ? focusedCount : (index === 0 ? 12 : index < 3 ? 8 : 6);
      
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
        avatar: getArtistImageFromData(data.artist.uri_artist, 'avatar')
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

    // Find max albumCount for focused genre (for scaling in focused view)
    let focusedMaxAlbumCount = 1;
    if (focusedGenre) {
      const focusedGenreObj = genreArtistData.find(g => g.genre === focusedGenre);
      if (focusedGenreObj && focusedGenreObj.topArtists.length > 0) {
        focusedMaxAlbumCount = Math.max(...focusedGenreObj.topArtists.map(a => a.albumCount));
      }
    }

    // Handle window resize
    const handleResize = () => {
      // Force re-render by clearing and re-running effect
      const elem = svgRef.current;
      if (elem) {
        const svg = d3.select(elem);
        svg.selectAll('*').remove();
      }
      // Small delay to ensure container has updated dimensions
      setTimeout(() => {
        if (svgRef.current) {
          renderVisualization();
        }
      }, 100);
    };

    const renderVisualization = () => {
      const elem = svgRef.current;
      if (!elem) return;

      const svg = d3.select(elem);
      svg.selectAll('*').remove(); // Clear previous render

      // Get container dimensions dynamically
      const container = elem.parentElement;
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
        { x: -0.7, y: 0.6 },      // Bottom left
        { x: 0, y: -0.95 },       // Far top center
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
        const clusterRadius = isFocused ? 100 : 120; // Start closer to center for focused view
        
        genreData.topArtists.forEach((artist, j) => {
          let angle, radius;
          
          if (isFocused) {
            // Sort artists by albumCount descending for ring placement
            const sortedArtists = [...genreData.topArtists].sort((a, b) => b.albumCount - a.albumCount);
            const artistIndex = sortedArtists.findIndex(a => a.slug === artist.slug);
            const rings = 4;
            const artistsPerRing = Math.ceil(artistCount / rings);
            const ring = Math.floor(artistIndex / artistsPerRing);
            const angleInRing = (artistIndex % artistsPerRing) / artistsPerRing * 2 * Math.PI;
            angle = angleInRing;
            const maxRadius = Math.min(width, height) * 0.4;
            const minRadius = clusterRadius;
            const ringSpacing = (maxRadius - minRadius) / (rings - 1);
            radius = minRadius + ring * ringSpacing + (Math.random() - 0.5) * 10;
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
      const simulation = d3.forceSimulation<MindMapNode>(nodes)
        .force('link', d3.forceLink<MindMapLink, MindMapNode>(links).id((d) => d.id).distance(120).strength(0.7))
        .force('charge', d3.forceManyBody().strength(-80)) // Gentle repulsion
        .force('collision', d3.forceCollide<MindMapNode>().radius((d) => {
          // Dynamic collision radius based on artist size and mobile
          if (d.type === 'artist') {
            const isMobile = width < 768;
            const minSize = isMobile ? 16 : 20;
            const maxSize = isMobile ? 32 : 40;
            const multiplier = isMobile ? 2 : 3;
            const size = Math.max(minSize, Math.min(maxSize, (isMobile ? 14 : 18) + (d.albumCount * multiplier)));
            return size + (isMobile ? 8 : 10); // Tighter padding on mobile
          }
          return 60; // Genre nodes
        })) // Dynamic collision radius
        .force('boundary', () => {
          // Keep nodes within viewport bounds
          const margin = 100;
          nodes.forEach((node) => {
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
        .attr('stroke', 'var(--stage-rule)')
        .attr('stroke-width', 1.5)
        .attr('stroke-opacity', (d: MindMapLink) => {
          if (!focusedGenre) return 0.3;
          const sourceNode = nodes.find(n => n.id === (typeof d.source === 'string' ? d.source : (d.source as MindMapNode).id));
          return sourceNode?.genre === focusedGenre ? 0.6 : 0.1;
        });

      // Create genre nodes
      const genreGroup = svg.append('g').attr('class', 'genres');
      const genreNodes = genreGroup.selectAll('g')
        .data(nodes.filter(n => n.type === 'genre'))
        .enter().append('g')
        .style('cursor', 'pointer')
        .on('click', (event, d: MindMapNode) => {
          event.stopPropagation();
          if (focusedGenre === d.name) {
            // If already focused, unfocus
            setFocusedGenre(null);
          } else {
            // Focus this genre
            setFocusedGenre(d.name);
          }
        })
        .call(d3.drag<SVGGElement, MindMapNode>()
          .on('start', (event, d: MindMapNode) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d: MindMapNode) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d: MindMapNode) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }));

      genreNodes.append('circle')
        .attr('r', d => Math.max(35, Math.min(55, d.albumCount * 1.5)))
        .attr('fill', (_d, i) => (i === 0 ? 'var(--hl)' : 'var(--stage-2)'))
        .attr('stroke', 'var(--stage-rule)')
        .attr('stroke-width', 3)
        .style('filter', 'drop-shadow(2px 2px 4px rgba(0,0,0,0.2))')
        .style('opacity', (d: MindMapNode) => {
          if (!focusedGenre) return 1;
          return focusedGenre === d.name ? 1 : 0.3;
        });

      // Add wrapped text for genre names
      genreNodes.each(function(d: MindMapNode) {
        const node = d3.select(this);
        const words = d.name.split(/[\s,&]+/); // Split on spaces, commas, and ampersands
        const lineHeight = 12;
        // const maxWidth = 80; // Maximum width for text - not currently used
        
        if (words.length <= 2) {
          // Short names - single or two words
          if (words.length === 1) {
            node.append('text')
              .attr('text-anchor', 'middle')
              .attr('dy', 4)
              .style('fill', 'var(--stage-ink)')
              .style('font-weight', 'bold')
              .style('font-size', '11px')
              .text(d.name);
          } else {
            // Two words - put each on its own line
            node.append('text')
              .attr('text-anchor', 'middle')
              .attr('dy', -2)
              .style('fill', 'var(--stage-ink)')
              .style('font-weight', 'bold')
              .style('font-size', '11px')
              .text(words[0]);
            
            node.append('text')
              .attr('text-anchor', 'middle')
              .attr('dy', 10)
              .style('fill', 'var(--stage-ink)')
              .style('font-weight', 'bold')
              .style('font-size', '11px')
              .text(words.slice(1).join(' '));
          }
        } else {
          // Long names - wrap intelligently
          const lines: string[] = [];
          let currentLine = '';
          
          words.forEach((word: string) => {
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
              .style('fill', 'var(--stage-ink)')
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
        .call(d3.drag<SVGGElement, MindMapNode>()
          .on('start', (event, d: MindMapNode) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d: MindMapNode) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d: MindMapNode) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }))
        .on('click', (event, d) => {
          if (d.slug) {
            navigate(`/artist/${d.slug}`);
          }
        });

      // Artist avatar border (no fill, just stroke for definition) - size based on album count
      artistNodes.append('circle')
        .attr('r', (d: MindMapNode) => {
          const isMobile = width < 768;
          if (!focusedGenre) {
            const minSize = isMobile ? 12 : 16;
            const maxSize = isMobile ? 32 : 44;
            const size = minSize + Math.sqrt(d.albumCount) * (isMobile ? 2.5 : 3.5);
            return Math.max(minSize, Math.min(maxSize, size));
          } else {
            const minSize = 10;
            const maxSize = 50;
            const ratio = focusedMaxAlbumCount > 0 ? d.albumCount / focusedMaxAlbumCount : 0;
            const size = minSize + (maxSize - minSize) * Math.pow(ratio, 0.9);
            return Math.max(minSize, Math.min(maxSize, size));
          }
        })
        .attr('fill', 'none')
        .attr('stroke', 'var(--stage-rule)')
        .attr('stroke-width', 2)
        .style('filter', 'drop-shadow(1px 1px 3px rgba(0,0,0,0.3))')
        .style('opacity', (d: MindMapNode) => {
          if (!focusedGenre) return 1;
          return d.genre === focusedGenre ? 1 : 0.2;
        });

      // Artist avatar images - create circular clipping mask with dynamic size
      artistNodes.append('defs').append('clipPath')
        .attr('id', (d) => `clip-${d.slug}`)
        .append('circle')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('r', (d: MindMapNode) => {
          const isMobile = width < 768;
          if (!focusedGenre) {
            const minSize = isMobile ? 12 : 16;
            const maxSize = isMobile ? 32 : 44;
            const size = minSize + Math.sqrt(d.albumCount) * (isMobile ? 2.5 : 3.5);
            return Math.max(minSize, Math.min(maxSize, size));
          } else {
            const minSize = 10;
            const maxSize = 50;
            const ratio = focusedMaxAlbumCount > 0 ? d.albumCount / focusedMaxAlbumCount : 0;
            const size = minSize + (maxSize - minSize) * Math.pow(ratio, 0.9);
            return Math.max(minSize, Math.min(maxSize, size));
          }
        });

      artistNodes.append('image')
        .attr('href', d => d.avatar || '')
        .attr('x', (d: MindMapNode) => {
          const isMobile = width < 768;
          let size;
          if (!focusedGenre) {
            const minSize = isMobile ? 12 : 16;
            const maxSize = isMobile ? 32 : 44;
            size = Math.max(minSize, Math.min(maxSize, minSize + Math.sqrt(d.albumCount) * (isMobile ? 2.5 : 3.5)));
          } else {
            const minSize = 10;
            const maxSize = 50;
            const ratio = focusedMaxAlbumCount > 0 ? d.albumCount / focusedMaxAlbumCount : 0;
            size = Math.max(minSize, Math.min(maxSize, minSize + (maxSize - minSize) * Math.pow(ratio, 0.9)));
          }
          return -size;
        })
        .attr('y', (d: MindMapNode) => {
          const isMobile = width < 768;
          let size;
          if (!focusedGenre) {
            const minSize = isMobile ? 12 : 16;
            const maxSize = isMobile ? 32 : 44;
            size = Math.max(minSize, Math.min(maxSize, minSize + Math.sqrt(d.albumCount) * (isMobile ? 2.5 : 3.5)));
          } else {
            const minSize = 10;
            const maxSize = 50;
            const ratio = focusedMaxAlbumCount > 0 ? d.albumCount / focusedMaxAlbumCount : 0;
            size = Math.max(minSize, Math.min(maxSize, minSize + (maxSize - minSize) * Math.pow(ratio, 0.9)));
          }
          return -size;
        })
        .attr('width', (d: MindMapNode) => {
          const isMobile = width < 768;
          let size;
          if (!focusedGenre) {
            const minSize = isMobile ? 12 : 16;
            const maxSize = isMobile ? 32 : 44;
            size = Math.max(minSize, Math.min(maxSize, minSize + Math.sqrt(d.albumCount) * (isMobile ? 2.5 : 3.5)));
          } else {
            const minSize = 10;
            const maxSize = 50;
            const ratio = focusedMaxAlbumCount > 0 ? d.albumCount / focusedMaxAlbumCount : 0;
            size = Math.max(minSize, Math.min(maxSize, minSize + (maxSize - minSize) * Math.pow(ratio, 0.9)));
          }
          return size * 2;
        })
        .attr('height', (d: MindMapNode) => {
          const isMobile = width < 768;
          let size;
          if (!focusedGenre) {
            const minSize = isMobile ? 12 : 16;
            const maxSize = isMobile ? 32 : 44;
            size = Math.max(minSize, Math.min(maxSize, minSize + Math.sqrt(d.albumCount) * (isMobile ? 2.5 : 3.5)));
          } else {
            const minSize = 10;
            const maxSize = 50;
            const ratio = focusedMaxAlbumCount > 0 ? d.albumCount / focusedMaxAlbumCount : 0;
            size = Math.max(minSize, Math.min(maxSize, minSize + (maxSize - minSize) * Math.pow(ratio, 0.9)));
          }
          return size * 2;
        })
        .attr('clip-path', (d) => `url(#clip-${d.slug})`)
        .attr('preserveAspectRatio', 'xMidYMid slice')
        .style('opacity', (d: MindMapNode) => {
          if (!focusedGenre) return 1;
          return d.genre === focusedGenre ? 1 : 0.2;
        })
        .on('error', function() {
          // For failed images, add a gray background circle
          if (this.parentNode) {
            d3.select(this.parentNode as Element)
              .append('circle')
              .attr('r', 28)
              .attr('fill', 'var(--stage-3)')
              .attr('stroke', 'var(--stage-rule)')
              .attr('stroke-width', 2);
          }
        });

      // No artist labels - cleaner look

      // Tooltip group (one for all artists, reused)
      let tooltipGroup: d3.Selection<SVGGElement, unknown, null, undefined> = svg.select('g.artist-tooltip');
      if (tooltipGroup.empty()) {
        tooltipGroup = svg.append('g').attr('class', 'artist-tooltip') as d3.Selection<SVGGElement, unknown, null, undefined>;
      }
      tooltipGroup.style('pointer-events', 'none');
      tooltipGroup.selectAll('*').remove();

      // Simple hover effects - just scale the entire node
      artistNodes
        .on('mouseenter', function(event, d: MindMapNode) {
          d3.select(this).attr('data-hovered', 'true');
          // Move this node to the end of the group to bring to foreground
          if (this.parentNode) {
            this.parentNode.appendChild(this);
          }
          // Calculate current radius for this node
          let currentRadius;
          if (!focusedGenre) {
            const minSize = width < 768 ? 12 : 16;
            const maxSize = width < 768 ? 32 : 44;
            currentRadius = Math.max(minSize, Math.min(maxSize, minSize + Math.sqrt(d.albumCount) * (width < 768 ? 2.5 : 3.5)));
          } else {
            const minSize = 10;
            const maxSize = 50;
            const ratio = focusedMaxAlbumCount > 0 ? d.albumCount / focusedMaxAlbumCount : 0;
            currentRadius = Math.max(minSize, Math.min(maxSize, minSize + (maxSize - minSize) * Math.pow(ratio, 0.9)));
          }
          // Animate to 128px diameter (radius 64)
          d3.select(this)
            .transition()
            .duration(200)
            .attr('transform', `translate(${d.x},${d.y}) scale(${64 / currentRadius})`);
          // Pulse effect on border
          d3.select(this).select('circle')
            .attr('class', 'pulse-border')
            .transition()
            .duration(200)
            .attr('stroke', 'var(--hl)')
            .attr('stroke-width', 4);
          // Tooltip: show and animate
          tooltipGroup.selectAll('*').remove();
          // Calculate text width for dynamic sizing
          const tempText = svg.append('text')
            .attr('font-size', 15)
            .attr('font-weight', 'bold')
            .text(d.name);
          const textWidth = tempText.node()?.getBBox().width || 60;
          tempText.remove();
          const padding = 18;
          const boxWidth = textWidth + padding * 2;
          const boxHeight = 32;
          const tooltipY = (d.y ?? 0) - 80;
          const tooltip = tooltipGroup.append('g')
            .attr('transform', `translate(${d.x},${tooltipY}) scale(0.7)`)
            .attr('opacity', 0);
          // Tooltip background
          tooltip.append('rect')
            .attr('x', -boxWidth / 2)
            .attr('y', -boxHeight / 2)
            .attr('rx', 8)
            .attr('ry', 8)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', 'var(--stage-ink)')
            .attr('stroke', 'var(--hl)')
            .attr('stroke-width', 1.5)
            .attr('filter', 'drop-shadow(0px 2px 6px rgba(0,0,0,0.10))');
          // Tooltip text
          tooltip.append('text')
            .attr('x', 0)
            .attr('y', 5)
            .attr('text-anchor', 'middle')
            .attr('font-size', 15)
            .attr('font-weight', 'bold')
            .attr('fill', 'var(--stage)')
            .text(d.name);
          // Animate tooltip pop
          tooltip.transition()
            .duration(180)
            .attr('transform', `translate(${d.x},${tooltipY}) scale(1)`)
            .attr('opacity', 1);
        })
        .on('mouseleave', function(event, d) {
          d3.select(this).attr('data-hovered', 'false');
          d3.select(this)
            .transition()
            .duration(200)
            .attr('transform', `translate(${d.x},${d.y}) scale(1)`);
          d3.select(this).select('circle')
            .attr('class', null)
            .transition()
            .duration(200)
            .attr('stroke', 'var(--stage-rule)')
            .attr('stroke-width', 2);
          // Animate tooltip out
          tooltipGroup.selectAll('g').transition()
            .duration(120)
            .attr('transform', `translate(${d.x},${(d.y ?? 0) - 80}) scale(0.7)`)
            .attr('opacity', 0)
            .remove();
        });

      // Update positions on simulation tick
      simulation.on('tick', () => {
        // Update link positions with straight lines
        linkElements
          .attr('x1', (d: MindMapLink) => {
            const source = nodes.find(n => n.id === (typeof d.source === 'string' ? d.source : (d.source as MindMapNode).id));
            return source?.x || 0;
          })
          .attr('y1', (d: MindMapLink) => {
            const source = nodes.find(n => n.id === (typeof d.source === 'string' ? d.source : (d.source as MindMapNode).id));
            return source?.y || 0;
          })
          .attr('x2', (d: MindMapLink) => {
            const target = nodes.find(n => n.id === (typeof d.target === 'string' ? d.target : (d.target as MindMapNode).id));
            return target?.x || 0;
          })
          .attr('y2', (d: MindMapLink) => {
            const target = nodes.find(n => n.id === (typeof d.target === 'string' ? d.target : (d.target as MindMapNode).id));
            return target?.y || 0;
          });

        // Update node positions
        genreNodes.attr('transform', d => `translate(${d.x},${d.y})`);
        artistNodes.attr('transform', function(d: MindMapNode) {
          const isHovered = d3.select(this).attr('data-hovered') === 'true';
          const scale = isHovered ? 'scale(1.15)' : 'scale(1)';
          return `translate(${d.x},${d.y}) ${scale}`;
        });
      });
    };

    // Initial render
    renderVisualization();

    // Add resize listener
    window.addEventListener('resize', handleResize);

    // Add CSS for pulse effect
    if (!document.getElementById('pulse-style')) {
      const style = document.createElement('style');
      style.id = 'pulse-style';
      style.textContent = `
        .pulse-border {
          animation: pulse 0.7s infinite alternate;
        }
        @keyframes pulse {
          0% { stroke-width: 4; stroke: var(--hl); }
          100% { stroke-width: 14; stroke: color-mix(in oklab, var(--hl) 70%, var(--stage-ink)); }
        }
      `;
      document.head.appendChild(style);
    }

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
    };

  }, [genreArtistData, navigate, focusedGenre]);

  if (loading) {
    return (
      <PageContainer>
        <EditorialSkeleton label="Loading genre mind map…" />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <EditorialEmpty title="Genre map failed" detail={error} />
      </PageContainer>
    );
  }
  const header = redesignConfig.pageHeaders.genres;

  return (
    <PageContainer>
      <DossierHero
        num={header.num}
        kicker={header.kicker}
        title={header.title}
        subtitle={header.subtitle}
        counts={[
          { label: 'Genres', value: genreArtistData.length },
          { label: 'Records', value: albums.length.toLocaleString() },
          { label: 'Focus', value: focusedGenre || 'All' },
        ]}
      />
      <div className="border border-stage-rule bg-stage p-3 text-stage-ink md:p-5">
        {genreArtistData.length > 0 ? (
          <div className="flex h-[76dvh] min-h-[560px] w-full justify-center">
            <svg ref={svgRef} className="h-full w-full" aria-label="Genre mind map" role="img" />
          </div>
        ) : (
          <EditorialEmpty title="No genre data available" className="border-stage-rule bg-stage-2" />
        )}
      </div>
    </PageContainer>
  );
}
