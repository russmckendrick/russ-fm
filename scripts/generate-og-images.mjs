#!/usr/bin/env node

import satori from 'satori';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '../public');

// Load fonts
const fontRegular = await fs.readFile(path.join(__dirname, '../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff'));
const fontBold = await fs.readFile(path.join(__dirname, '../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff'));

// OG Image template using React-like JSX
async function AlbumOGCard({ album, colors, imageBase64 }) {
  const albumSlug = album.uri_release.split('/')[2];

  return {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        backgroundColor: colors.background,
        color: colors.foreground,
        fontFamily: 'Inter',
      },
      children: [
        // Left side - Album artwork
        {
          type: 'div',
          props: {
            style: {
              width: '630px',
              height: '630px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px',
            },
            children: [
              {
                type: 'img',
                props: {
                  src: `data:image/jpeg;base64,${imageBase64}`,
                  style: {
                    width: '550px',
                    height: '550px',
                    borderRadius: '12px',
                    boxShadow: `0 25px 50px -12px ${colors.background}`,
                  }
                }
              }
            ]
          }
        },
        // Right side - Album info
        {
          type: 'div',
          props: {
            style: {
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '60px',
              gap: '20px',
            },
            children: [
              // Album title
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '56px',
                    fontWeight: 700,
                    lineHeight: 1.2,
                    color: colors.foreground,
                    marginBottom: '10px',
                  },
                  children: album.release_name.length > 40
                    ? album.release_name.substring(0, 40) + '...'
                    : album.release_name
                }
              },
              // Artist name
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '36px',
                    fontWeight: 400,
                    color: colors.accent,
                    marginBottom: '20px',
                  },
                  children: album.release_artist
                }
              },
              // Year and genre
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '28px',
                    fontWeight: 400,
                    color: colors.foreground,
                    opacity: 0.7,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex' },
                        children: String(new Date(album.date_release_year).getFullYear())
                      }
                    },
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex' },
                        children: album.genre_names.slice(0, 2).join(' • ')
                      }
                    }
                  ]
                }
              },
              // Site branding at bottom
              {
                type: 'div',
                props: {
                  style: {
                    marginTop: 'auto',
                    fontSize: '24px',
                    fontWeight: 600,
                    color: colors.accent,
                    opacity: 0.8,
                  },
                  children: 'russ.fm'
                }
              }
            ]
          }
        }
      ]
    }
  };
}

// Artist OG Image template
async function ArtistOGCard({ artist, imageBase64 }) {
  // Extract genre and album count from bio or use defaults
  const genres = artist.genres?.slice(0, 3).join(' • ') || 'Artist';
  const bioSnippet = artist.biography
    ? (artist.biography.length > 200 ? artist.biography.substring(0, 200) + '...' : artist.biography)
    : 'Explore this artist\'s music collection';

  return {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        backgroundColor: '#0a0a0a',
        color: '#ffffff',
        fontFamily: 'Inter',
      },
      children: [
        // Left side - Artist image
        {
          type: 'div',
          props: {
            style: {
              width: '630px',
              height: '630px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px',
            },
            children: [
              {
                type: 'img',
                props: {
                  src: `data:image/jpeg;base64,${imageBase64}`,
                  style: {
                    width: '550px',
                    height: '550px',
                    borderRadius: '12px',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                  }
                }
              }
            ]
          }
        },
        // Right side - Artist info
        {
          type: 'div',
          props: {
            style: {
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '60px',
              gap: '20px',
            },
            children: [
              // Artist name
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '64px',
                    fontWeight: 700,
                    lineHeight: 1.2,
                    color: '#ffffff',
                    marginBottom: '10px',
                  },
                  children: artist.name.length > 30
                    ? artist.name.substring(0, 30) + '...'
                    : artist.name
                }
              },
              // Genres
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '32px',
                    fontWeight: 400,
                    color: '#a855f7',
                    marginBottom: '20px',
                  },
                  children: genres
                }
              },
              // Bio snippet
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '22px',
                    fontWeight: 400,
                    color: '#ffffff',
                    opacity: 0.7,
                    lineHeight: 1.4,
                  },
                  children: bioSnippet
                }
              },
              // Site branding at bottom
              {
                type: 'div',
                props: {
                  style: {
                    marginTop: 'auto',
                    fontSize: '24px',
                    fontWeight: 600,
                    color: '#a855f7',
                    opacity: 0.8,
                  },
                  children: 'russ.fm'
                }
              }
            ]
          }
        }
      ]
    }
  };
}

// Generic Site OG Image template (for pages without specific images)
async function GenericSiteOGCard({ recentAlbums, albumImages, totalAlbums, totalArtists }) {
  return {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0a0a0a',
        color: '#ffffff',
        fontFamily: 'Inter',
        padding: '60px',
      },
      children: [
        // Header
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              marginBottom: '40px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '72px',
                    fontWeight: 700,
                    color: '#ffffff',
                    marginBottom: '10px',
                  },
                  children: 'Russ.fm'
                }
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '32px',
                    fontWeight: 400,
                    color: '#a855f7',
                  },
                  children: 'Personal Record Collection'
                }
              }
            ]
          }
        },
        // Album grid
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              gap: '20px',
              marginBottom: '40px',
            },
            children: albumImages.map((imageBase64, index) => ({
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                },
                children: [
                  {
                    type: 'img',
                    props: {
                      src: `data:image/jpeg;base64,${imageBase64}`,
                      style: {
                        width: '230px',
                        height: '230px',
                        borderRadius: '8px',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                      }
                    }
                  }
                ]
              }
            }))
          }
        },
        // Footer stats
        {
          type: 'div',
          props: {
            style: {
              marginTop: 'auto',
              display: 'flex',
              gap: '40px',
              fontSize: '28px',
              fontWeight: 400,
              color: '#ffffff',
              opacity: 0.8,
            },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex' },
                  children: `${totalAlbums} Albums`
                }
              },
              {
                type: 'div',
                props: {
                  style: { display: 'flex' },
                  children: `${totalArtists} Artists`
                }
              }
            ]
          }
        }
      ]
    }
  };
}

// Helper to convert image to base64
async function imageToBase64(imagePath) {
  const buffer = await fs.readFile(imagePath);
  return buffer.toString('base64');
}

// Helper to get hi-res image path
function getHiResImagePath(obj, type) {
  let relativePath;
  if (type === 'album' && obj.images_uri_release?.['hi-res']) {
    relativePath = obj.images_uri_release['hi-res'];
  } else if (type === 'artist' && obj.images_uri_artist?.['hi-res']) {
    relativePath = obj.images_uri_artist['hi-res'];
  }

  if (relativePath) {
    return relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
  }

  // Fallback
  const slug = (type === 'album' ? obj.uri_release : obj.uri_artist).split('/')[2];
  return `${type}/${slug}/${slug}-hi-res.jpg`;
}

// Generate OG image for a single album
async function generateAlbumOGImage(album, colors, baseDir) {
  const albumSlug = album.uri_release.split('/')[2];
  const outputPath = path.join(baseDir, 'album', albumSlug, 'og-image.png');

  // Check if exists
  try {
    await fs.access(outputPath);
    // If we're here, it exists. We can skip generation? 
    // Yes, assuming cache is trusted.
    // console.log(`  Skipping (cached): ${album.release_name}`);
    return true;
  } catch (e) {
    // Proceed to generate
  }

  // Read hi-res image from public dir (only hi-res is stored in repo)
  const relativeHiResPath = getHiResImagePath(album, 'album');
  const hiResPath = path.join(publicDir, relativeHiResPath);

  console.log(`Generating OG image for: ${album.release_name}`);

  try {
    const imageBase64 = await imageToBase64(hiResPath);
    const template = await AlbumOGCard({ album, colors, imageBase64 });

    const svg = await satori(template, {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Inter',
          data: fontRegular,
          weight: 400,
          style: 'normal',
        },
        {
          name: 'Inter',
          data: fontBold,
          weight: 700,
          style: 'normal',
        },
      ],
    });

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Convert SVG to PNG
    await sharp(Buffer.from(svg))
      .png()
      .toFile(outputPath);

    console.log(`✓ Generated: ${outputPath}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to generate OG image for ${album.release_name} (${hiResPath}):`, error.message);
    return false;
  }
}

// Generate generic site OG image
async function generateGenericOGImage(collection, baseDir) {
  const outputPath = path.join(baseDir, 'og-image.png');

  try {
    await fs.access(outputPath);
    return true;
  } catch (e) { }

  console.log('Generating generic site OG image...');

  try {
    // Get last 4 albums added
    const sortedByDate = [...collection].sort((a, b) =>
      new Date(b.date_added).getTime() - new Date(a.date_added).getTime()
    );
    const recentAlbums = sortedByDate.slice(0, 4);

    // Load album images
    const albumImages = [];
    for (const album of recentAlbums) {
      const relativeHiResPath = getHiResImagePath(album, 'album');
      const hiResPath = path.join(publicDir, relativeHiResPath);
      try {
        const imageBase64 = await imageToBase64(hiResPath);
        albumImages.push(imageBase64);
      } catch (error) {
        console.log(`  ⚠️  Could not load image for ${album.release_name}`);
      }
    }

    // If we don't have 4 images, skip
    if (albumImages.length < 4) {
      console.log(`  ⚠️  Not enough album images (found ${albumImages.length}, need 4)`);
      return false;
    }

    // Get unique artists count
    const artistsSet = new Set();
    collection.forEach(album => {
      if (album.artists && Array.isArray(album.artists)) {
        album.artists.forEach(artist => artistsSet.add(artist.uri_artist));
      }
    });

    const template = await GenericSiteOGCard({
      recentAlbums,
      albumImages,
      totalAlbums: collection.length,
      totalArtists: artistsSet.size
    });

    const svg = await satori(template, {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Inter',
          data: fontRegular,
          weight: 400,
          style: 'normal',
        },
        {
          name: 'Inter',
          data: fontBold,
          weight: 700,
          style: 'normal',
        },
      ],
    });

    // Convert SVG to PNG
    await sharp(Buffer.from(svg))
      .png()
      .toFile(outputPath);

    console.log(`✓ Generated: ${outputPath}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to generate generic OG image:`, error.message);
    return false;
  }
}

// Generate OG image for a single artist
async function generateArtistOGImage(artist, baseDir) {
  const artistSlug = artist.uri_artist.split('/')[2];
  const outputPath = path.join(baseDir, 'artist', artistSlug, 'og-image.png');

  // Check if exists
  try {
    await fs.access(outputPath);
    return true;
  } catch (e) {
    // Proceed
  }

  // Read hi-res image from public dir
  const relativeHiResPath = getHiResImagePath(artist, 'artist');
  const hiResPath = path.join(publicDir, relativeHiResPath);

  console.log(`Generating OG image for: ${artist.name}`);

  try {
    const imageBase64 = await imageToBase64(hiResPath);

    // Load detailed artist data for biography and genres
    let detailedArtist = artist;
    try {
      const artistJsonPath = path.join(publicDir, 'artist', artistSlug, `${artistSlug}.json`);
      const artistData = JSON.parse(await fs.readFile(artistJsonPath, 'utf-8'));
      detailedArtist = { ...artist, ...artistData };
    } catch (error) {
      console.log(`  ⚠️  Could not load detailed artist data for ${artist.name}`);
    }

    const template = await ArtistOGCard({ artist: detailedArtist, imageBase64 });

    const svg = await satori(template, {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Inter',
          data: fontRegular,
          weight: 400,
          style: 'normal',
        },
        {
          name: 'Inter',
          data: fontBold,
          weight: 700,
          style: 'normal',
        },
      ],
    });

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Convert SVG to PNG
    await sharp(Buffer.from(svg))
      .png()
      .toFile(outputPath);

    console.log(`✓ Generated: ${outputPath}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to generate OG image for ${artist.name}:`, error.message);
    return false;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const userOutputDir = args[0] && !args[0].startsWith('--') ? args[0] : path.join(__dirname, '../dist');

  // Parse flags
  const cacheDirIndex = args.indexOf('--cache-dir');
  const cacheDir = cacheDirIndex !== -1 && cacheDirIndex + 1 < args.length ? args[cacheDirIndex + 1] : null;

  // Determine where we are generating images to initially
  const targetDir = cacheDir ? (path.isAbsolute(cacheDir) ? cacheDir : path.join(process.cwd(), cacheDir)) : userOutputDir;

  console.log(`🎨 Starting OG image generation...`);
  console.log(`   Target: ${targetDir}`);
  if (cacheDir) console.log(`   Final Output: ${userOutputDir}`);

  // Load data
  const collection = JSON.parse(await fs.readFile(path.join(publicDir, 'collection.json'), 'utf-8'));
  const albumColors = JSON.parse(await fs.readFile(path.join(publicDir, 'album-colors.json'), 'utf-8'));

  // === ALBUMS ===
  console.log('📀 Generating OG images for albums...\n');
  let albumSuccessCount = 0;
  let albumFailCount = 0;

  for (const album of collection) {
    const colors = albumColors[album.uri_release];

    if (!colors) {
      console.log(`⚠ Skipping ${album.release_name} - no colors found`);
      albumFailCount++;
      continue;
    }

    const success = await generateAlbumOGImage(album, colors, targetDir);
    if (success) {
      albumSuccessCount++;
    } else {
      albumFailCount++;
    }
  }

  console.log(`\n✓ Albums: ${albumSuccessCount} generated, ${albumFailCount} failed\n`);

  // === ARTISTS ===
  console.log('🎤 Generating OG images for artists...\n');
  let artistSuccessCount = 0;
  let artistFailCount = 0;

  // Extract unique artists from collection
  const artistsMap = new Map();
  for (const album of collection) {
    if (album.artists && Array.isArray(album.artists)) {
      for (const artist of album.artists) {
        if (artist.uri_artist && !artistsMap.has(artist.uri_artist)) {
          artistsMap.set(artist.uri_artist, artist);
        }
      }
    }
  }

  const uniqueArtists = Array.from(artistsMap.values());
  console.log(`Found ${uniqueArtists.length} unique artists\n`);

  for (const artist of uniqueArtists) {
    const success = await generateArtistOGImage(artist, targetDir);
    if (success) {
      artistSuccessCount++;
    } else {
      artistFailCount++;
    }
  }

  console.log(`\n✓ Artists: ${artistSuccessCount} generated, ${artistFailCount} failed\n`);

  // === GENERIC SITE OG IMAGE ===
  console.log('🌐 Generating generic site OG image...\n');
  const genericSuccess = await generateGenericOGImage(collection, targetDir);
  console.log(genericSuccess ? '\n✓ Generic OG image generated\n' : '\n✗ Failed to generate generic OG image\n');

  console.log(`\n✨ Complete! Total: ${albumSuccessCount + artistSuccessCount + (genericSuccess ? 1 : 0)} images generated, ${albumFailCount + artistFailCount + (genericSuccess ? 0 : 1)} failed`);

  // Copy if using cache
  if (cacheDir) {
    console.log(`\n📂 Copying from cache to output: ${userOutputDir}`);
    await copyDirRecursive(targetDir, userOutputDir);
  }
}

async function copyDirRecursive(src, dest) {
  try {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await copyDirRecursive(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  } catch (err) {
    console.error(`Error copying ${src} to ${dest}:`, err);
  }
}

main().catch(console.error);
