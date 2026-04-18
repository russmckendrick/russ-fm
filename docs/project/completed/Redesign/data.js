// All sample data for the redesign. Cover SVGs are placeholder gradients
// derived from the dominant color so we can demo the cover-color tinting
// without external image assets.

window.RUSS_DATA = (() => {
  const sleeve = (id, c1, c2, c3, label, sub, motif = 'wave') => {
    // Build an SVG sleeve placeholder with a couple of motifs so the wall
    // doesn't feel like 30 identical tiles.
    const motifs = {
      wave: `<path d='M0 320 Q150 240 300 320 T600 320 V600 H0 Z' fill='${c3}' opacity='0.55'/>
             <path d='M0 380 Q150 300 300 380 T600 380 V600 H0 Z' fill='${c2}' opacity='0.7'/>`,
      grid: `<g stroke='${c3}' stroke-width='1' opacity='0.35'>
             ${Array.from({length: 12}, (_, i) => `<line x1='${i*50}' y1='0' x2='${i*50}' y2='600'/>`).join('')}
             ${Array.from({length: 12}, (_, i) => `<line x1='0' y1='${i*50}' x2='600' y2='${i*50}'/>`).join('')}
             </g>`,
      sun:  `<circle cx='300' cy='320' r='140' fill='${c3}' opacity='0.85'/>
             <circle cx='300' cy='320' r='90'  fill='${c2}' opacity='0.9'/>`,
      bars: `${Array.from({length: 7}, (_, i) => `<rect x='${30+i*80}' y='${120+i*20}' width='40' height='${360-i*30}' fill='${i%2?c2:c3}' opacity='0.8'/>`).join('')}`,
      circle: `<circle cx='300' cy='300' r='240' fill='none' stroke='${c3}' stroke-width='40' opacity='0.7'/>
               <circle cx='300' cy='300' r='160' fill='none' stroke='${c2}' stroke-width='24' opacity='0.85'/>
               <circle cx='300' cy='300' r='30' fill='${c3}'/>`,
      slab: `<rect x='60' y='80' width='480' height='280' fill='${c3}' opacity='0.85'/>
             <rect x='60' y='380' width='200' height='40' fill='${c2}'/>`,
      diag: `<g fill='${c3}' opacity='0.7'>
             ${Array.from({length: 8}, (_, i) => `<polygon points='${i*100},0 ${i*100+60},0 ${i*100-200},600 ${i*100-260},600'/>`).join('')}
             </g>`,
    };
    const m = motifs[motif] || motifs.wave;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600'>
      <rect width='600' height='600' fill='${c1}'/>
      ${m}
      <text x='40' y='80' fill='${c3}' font-family='Inter Tight, system-ui' font-size='28' font-weight='800' letter-spacing='-0.02em'>${label}</text>
      <text x='40' y='560' fill='${c3}' font-family='JetBrains Mono, monospace' font-size='14' opacity='0.85'>${sub}</text>
    </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.replace(/\s+/g, ' '));
  };

  const albums = [
    { id: 'a01', title: '20 Jazz Funk Greats', artist: 'Throbbing Gristle', year: 1979, country: 'UK',
      genres: ['Industrial','Electronic','Avant'], tracks: 11, format: 'LP',
      added: '12 APR 26', label: 'Industrial Records', dom: '#8a8a3d', accent: '#c8c459',
      cover: sleeve('a01', '#8a8a3d', '#c8c459', '#1a1a06', 'TG / 1979', 'INDUSTRIAL RECORDS · IR0008', 'sun') },
    { id: 'a02', title: 'Spiderland', artist: 'Slint', year: 1991, country: 'US',
      genres: ['Post-Rock','Math Rock'], tracks: 6, format: 'LP',
      added: '11 APR 26', label: 'Touch and Go', dom: '#1a1a1a', accent: '#9aa6b2',
      cover: sleeve('a02', '#1a1a1a', '#33373a', '#cfd6dd', 'SLINT', 'TOUCH AND GO · TG64', 'wave') },
    { id: 'a03', title: 'Doolittle', artist: 'Pixies', year: 1989, country: 'US',
      genres: ['Alternative','Indie Rock'], tracks: 15, format: 'LP',
      added: '10 APR 26', label: '4AD', dom: '#d6c89a', accent: '#7a4b2a',
      cover: sleeve('a03', '#d6c89a', '#a87a4f', '#3a1f0f', 'DOOLITTLE', '4AD · CAD905', 'circle') },
    { id: 'a04', title: 'Hauntings', artist: 'Richard Davidson', year: 2024, country: 'UK',
      genres: ['Ambient','Modern Classical'], tracks: 9, format: 'LP',
      added: '09 APR 26', label: 'Erased Tapes', dom: '#1f1f24', accent: '#d23b2d',
      cover: sleeve('a04', '#1f1f24', '#2c2c34', '#d23b2d', 'HAUNTINGS', 'ERASED TAPES · ERATP142', 'slab') },
    { id: 'a05', title: 'Slanted and Enchanted', artist: 'Pavement', year: 1992, country: 'US',
      genres: ['Indie','Lo-fi'], tracks: 14, format: 'LP',
      added: '08 APR 26', label: 'Matador', dom: '#c93a2b', accent: '#f5c344',
      cover: sleeve('a05', '#c93a2b', '#f5c344', '#1a0a08', 'PAVEMENT', 'MATADOR · OLE 038', 'diag') },
    { id: 'a06', title: 'In a Bar, Under the Sea', artist: 'dEUS', year: 1996, country: 'BE',
      genres: ['Alternative','Art Rock'], tracks: 16, format: '2LP',
      added: '07 APR 26', label: 'Island', dom: '#e9e3d8', accent: '#d23b2d',
      cover: sleeve('a06', '#e9e3d8', '#d23b2d', '#1a1a1a', 'dEUS', 'ISLAND · 524 297', 'bars') },
    { id: 'a07', title: 'Worst Case Scenario', artist: 'dEUS', year: 1994, country: 'BE',
      genres: ['Alternative','Post-Punk'], tracks: 13, format: 'LP',
      added: '06 APR 26', label: 'Island', dom: '#7a3a1f', accent: '#e9b04f',
      cover: sleeve('a07', '#7a3a1f', '#a8612a', '#f5e0b0', 'WORST CASE', 'ISLAND · 518 478', 'wave') },
    { id: 'a08', title: 'The Afterglow', artist: 'KillerStar', year: 2023, country: 'UK',
      genres: ['Indie','Pop'], tracks: 10, format: 'LP',
      added: '05 APR 26', label: 'Cooking Vinyl', dom: '#3a3a3a', accent: '#e3d6b8',
      cover: sleeve('a08', '#3a3a3a', '#5a5a5a', '#e3d6b8', 'KILLERSTAR', 'COOKING VINYL · 814', 'slab') },
    { id: 'a09', title: 'Distracted', artist: 'Thundercat', year: 2025, country: 'US',
      genres: ['Funk','Jazz Fusion'], tracks: 11, format: 'LP',
      added: '04 APR 26', label: 'Brainfeeder', dom: '#191919', accent: '#a78bff',
      cover: sleeve('a09', '#191919', '#2a2a32', '#a78bff', 'THUNDERCAT', 'BRAINFEEDER · BF111', 'circle') },
    { id: 'a10', title: 'Milo Goes to College', artist: 'Descendents', year: 1982, country: 'US',
      genres: ['Punk','Hardcore'], tracks: 15, format: 'LP',
      added: '03 APR 26', label: 'New Alliance', dom: '#f0ead8', accent: '#1a1a1a',
      cover: sleeve('a10', '#f0ead8', '#cfc8b3', '#1a1a1a', 'MILO', 'NEW ALLIANCE · NAR012', 'grid') },
    { id: 'a11', title: "It's Only About You If You Think It Is", artist: 'IAMX', year: 2022, country: 'DE',
      genres: ['Electronic','Dark Wave'], tracks: 12, format: 'LP',
      added: '02 APR 26', label: 'Caroline', dom: '#0a0a0a', accent: '#e7e7e7',
      cover: sleeve('a11', '#0a0a0a', '#1f1f1f', '#e7e7e7', 'IAMX', 'CAROLINE · CAR2299', 'sun') },
    { id: 'a12', title: '…Famous Last Words…', artist: 'Supertramp', year: 1982, country: 'UK',
      genres: ['Rock','Pop Rock'], tracks: 10, format: 'LP',
      added: '01 APR 26', label: 'A&M', dom: '#3a1f1a', accent: '#f0a04a',
      cover: sleeve('a12', '#3a1f1a', '#a05a30', '#f5d6a0', 'SUPERTRAMP', 'A&M · SP-3732', 'wave') },
    { id: 'a13', title: 'Kid A', artist: 'Radiohead', year: 2000, country: 'UK',
      genres: ['Electronic','Art Rock'], tracks: 11, format: '2LP',
      added: '30 MAR 26', label: 'Parlophone', dom: '#b03028', accent: '#f5e8c8',
      cover: sleeve('a13', '#b03028', '#7a1a14', '#f5e8c8', 'KID A', 'PARLOPHONE · 7243', 'diag') },
    { id: 'a14', title: 'Loveless', artist: 'My Bloody Valentine', year: 1991, country: 'IE',
      genres: ['Shoegaze','Dream Pop'], tracks: 11, format: 'LP',
      added: '29 MAR 26', label: 'Creation', dom: '#d63a7a', accent: '#f5b3d0',
      cover: sleeve('a14', '#d63a7a', '#f5b3d0', '#3a0820', 'LOVELESS', 'CREATION · CRELP060', 'wave') },
    { id: 'a15', title: 'Selected Ambient Works 85-92', artist: 'Aphex Twin', year: 1992, country: 'UK',
      genres: ['Ambient','IDM'], tracks: 13, format: '2LP',
      added: '28 MAR 26', label: 'R&S', dom: '#1a3a4a', accent: '#5cc9d6',
      cover: sleeve('a15', '#1a3a4a', '#2a5a6a', '#5cc9d6', 'AFX', 'R&S · AMB3922', 'circle') },
    { id: 'a16', title: 'In the Aeroplane Over the Sea', artist: 'Neutral Milk Hotel', year: 1998, country: 'US',
      genres: ['Indie Folk','Lo-fi'], tracks: 11, format: 'LP',
      added: '27 MAR 26', label: 'Merge', dom: '#7a5a3a', accent: '#e3c89a',
      cover: sleeve('a16', '#7a5a3a', '#a87a4f', '#e3c89a', 'NMH', 'MERGE · MRG136', 'slab') },
    { id: 'a17', title: 'OK Computer', artist: 'Radiohead', year: 1997, country: 'UK',
      genres: ['Alternative','Art Rock'], tracks: 12, format: '2LP',
      added: '26 MAR 26', label: 'Parlophone', dom: '#9a9a9a', accent: '#1a1a1a',
      cover: sleeve('a17', '#9a9a9a', '#cfcfcf', '#1a1a1a', 'OK COMPUTER', 'PARLOPHONE · 7243', 'grid') },
    { id: 'a18', title: 'Discovery', artist: 'Daft Punk', year: 2001, country: 'FR',
      genres: ['Electronic','House'], tracks: 14, format: '2LP',
      added: '25 MAR 26', label: 'Virgin', dom: '#d6a428', accent: '#3a1a0a',
      cover: sleeve('a18', '#d6a428', '#f5c344', '#3a1a0a', 'DISCOVERY', 'VIRGIN · 8123622', 'sun') },
  ];

  const artists = [
    { id: 'ar01', name: 'Throbbing Gristle', albums: 4, country: 'UK', dom: '#8a8a3d',
      photo: sleeve('ar01', '#8a8a3d', '#c8c459', '#1a1a06', 'TG', 'INDUSTRIAL', 'sun') },
    { id: 'ar02', name: 'Slint', albums: 2, country: 'US', dom: '#1a1a1a',
      photo: sleeve('ar02', '#1a1a1a', '#33373a', '#cfd6dd', 'SLINT', 'POST-ROCK', 'wave') },
    { id: 'ar03', name: 'Pixies', albums: 5, country: 'US', dom: '#d6c89a',
      photo: sleeve('ar03', '#d6c89a', '#a87a4f', '#3a1f0f', 'PIXIES', 'ALT-ROCK', 'circle') },
    { id: 'ar04', name: 'Richard Davidson', albums: 1, country: 'UK', dom: '#1f1f24',
      photo: sleeve('ar04', '#1f1f24', '#2c2c34', '#d23b2d', 'R.D.', 'AMBIENT', 'slab') },
    { id: 'ar05', name: 'Pavement', albums: 3, country: 'US', dom: '#c93a2b',
      photo: sleeve('ar05', '#c93a2b', '#f5c344', '#1a0a08', 'PAVEMENT', 'INDIE', 'diag') },
    { id: 'ar06', name: 'dEUS', albums: 6, country: 'BE', dom: '#7a3a1f',
      photo: sleeve('ar06', '#7a3a1f', '#a8612a', '#f5e0b0', 'dEUS', 'ART ROCK', 'wave') },
    { id: 'ar07', name: 'Thundercat', albums: 2, country: 'US', dom: '#191919',
      photo: sleeve('ar07', '#191919', '#2a2a32', '#a78bff', 'TC', 'JAZZ FUSION', 'circle') },
    { id: 'ar08', name: 'Aphex Twin', albums: 4, country: 'UK', dom: '#1a3a4a',
      photo: sleeve('ar08', '#1a3a4a', '#2a5a6a', '#5cc9d6', 'AFX', 'IDM', 'circle') },
    { id: 'ar09', name: 'Radiohead', albums: 7, country: 'UK', dom: '#b03028',
      photo: sleeve('ar09', '#b03028', '#7a1a14', '#f5e8c8', 'RH', 'ART ROCK', 'diag') },
    { id: 'ar10', name: 'My Bloody Valentine', albums: 2, country: 'IE', dom: '#d63a7a',
      photo: sleeve('ar10', '#d63a7a', '#f5b3d0', '#3a0820', 'MBV', 'SHOEGAZE', 'wave') },
    { id: 'ar11', name: 'Daft Punk', albums: 3, country: 'FR', dom: '#d6a428',
      photo: sleeve('ar11', '#d6a428', '#f5c344', '#3a1a0a', 'DP', 'ELECTRONIC', 'sun') },
    { id: 'ar12', name: 'Neutral Milk Hotel', albums: 2, country: 'US', dom: '#7a5a3a',
      photo: sleeve('ar12', '#7a5a3a', '#a87a4f', '#e3c89a', 'NMH', 'INDIE FOLK', 'slab') },
  ];

  // Last scrobbles (fake, for the sidebar feed)
  const scrobbles = [
    { track: 'Hot On The Heels Of Love', artist: 'Throbbing Gristle', when: '2m' },
    { track: 'Beachy Head', artist: 'Throbbing Gristle', when: '7m' },
    { track: 'Good Morning, Captain', artist: 'Slint', when: '14m' },
    { track: 'Washer', artist: 'Slint', when: '22m' },
    { track: 'Debaser', artist: 'Pixies', when: '29m' },
    { track: 'Idioteque', artist: 'Radiohead', when: '38m' },
    { track: 'Xtal', artist: 'Aphex Twin', when: '46m' },
    { track: 'One More Time', artist: 'Daft Punk', when: '54m' },
  ];

  const stats = {
    albums: 847, artists: 312, tracks: 9_421, hours: 612,
    topGenres: [
      { name: 'Alternative', count: 142 },
      { name: 'Electronic', count: 118 },
      { name: 'Indie Rock', count: 96 },
      { name: 'Ambient', count: 71 },
      { name: 'Post-Rock', count: 54 },
      { name: 'Jazz', count: 48 },
      { name: 'Punk', count: 39 },
      { name: 'Folk', count: 32 },
    ],
    yearsHist: [
      { d: '60s', n: 18 }, { d: '70s', n: 64 }, { d: '80s', n: 121 },
      { d: '90s', n: 198 }, { d: '00s', n: 154 }, { d: '10s', n: 176 }, { d: '20s', n: 116 },
    ],
  };

  // Per-album extras (tracklist, blurb, identifiers)
  const tracksFor = (a) => {
    const seedNames = {
      a01: ['20 Jazz Funk Greats','Beachy Head','Still Walking','Tanith','Convincing People','Exotica','Hot On The Heels Of Love','Persuasion','Walkabout','What A Day','Six Six Sixties'],
      a02: ['Breadcrumb Trail','Nosferatu Man','Don, Aman','Washer','For Dinner…','Good Morning, Captain'],
      a03: ['Debaser','Tame','Wave Of Mutilation','I Bleed','Here Comes Your Man','Dead','Monkey Gone To Heaven','Mr. Grieves','Crackity Jones','La La Love You','No. 13 Baby','There Goes My Gun','Hey','Silver','Gouge Away'],
    };
    const names = seedNames[a.id] || Array.from({ length: a.tracks }, (_, i) => `Untitled ${String.fromCharCode(65 + i)}`);
    const half = Math.ceil(names.length / 2);
    const dur = (i) => `${2 + (i * 7) % 4}:${String((i * 23) % 60).padStart(2,'0')}`;
    return [
      { side: 'A', items: names.slice(0, half).map((n, i) => ({ n: i + 1, name: n, time: dur(i) })) },
      { side: 'B', items: names.slice(half).map((n, i) => ({ n: i + 1, name: n, time: dur(i + half) })) },
    ];
  };

  const blurbFor = (a) =>
    `${a.title} is a ${a.year} ${a.genres[0].toLowerCase()} record by ${a.artist}, released on ${a.label} and pressed in ${a.country}. A staple of the collection, it sits within a broader thread of ${a.genres.join(', ').toLowerCase()} releases catalogued here.`;

  const idents = (a) => ({
    upc: '7' + (a.id.charCodeAt(1) * 9876543).toString().padStart(11, '0').slice(0, 11),
    discogs: 'D' + (parseInt(a.id.slice(1), 10) * 487 + 100000),
    spotify: a.id.toUpperCase() + 'X' + 'KZ8aBcD9eF0gHiJ',
    apple:   '11' + (parseInt(a.id.slice(1), 10) * 837 + 1000000),
  });

  // Per-artist bios + linked album refs
  const artistBio = (ar) =>
    `${ar.name} is a ${ar.country === 'UK' ? 'British' : ar.country === 'US' ? 'American' : ar.country === 'BE' ? 'Belgian' : ar.country === 'IE' ? 'Irish' : ar.country === 'FR' ? 'French' : 'German'} act with ${ar.albums} releases catalogued here. Their work threads through the collection's ${(albums.find(al => al.artist === ar.name)?.genres[0] || 'core').toLowerCase()} canon.`;

  const albumsByArtist = (name) => albums.filter(al => al.artist === name);

  // ----- Extended stats for the /stats page -----
  const decadeBars = [
    { d: '1960s', n: 18, c: '#5cc9d6' },
    { d: '1970s', n: 64, c: '#f5a23a' },
    { d: '1980s', n: 121, c: '#e3c84a' },
    { d: '1990s', n: 198, c: '#d23b2d' },
    { d: '2000s', n: 154, c: '#a78bff' },
    { d: '2010s', n: 176, c: '#3aa3e3' },
    { d: '2020s', n: 116, c: '#e36b3a' },
  ];
  const topArtistsBig = [
    { name: 'Pink Floyd',     n: 41, dom: '#7a8a9a' },
    { name: 'Rush',           n: 30, dom: '#3a3530' },
    { name: 'David Bowie',    n: 24, dom: '#9a9a9a' },
    { name: 'Steven Wilson',  n: 24, dom: '#7a8794' },
    { name: 'Genesis',        n: 22, dom: '#3a3a3a' },
    { name: 'Matt Berry',     n: 20, dom: '#1a6a3a' },
    { name: 'Split Enz',      n: 19, dom: '#d6c64a' },
    { name: 'Marillion',      n: 19, dom: '#5a3a2a' },
    { name: 'The Cure',       n: 18, dom: '#1a1a1a' },
    { name: 'Throbbing Gristle', n: 14, dom: '#8a8a3d' },
  ];
  const topGenresBig = [
    { name: 'Rock',              pct: 86, c: '#3a8ad6' },
    { name: 'Alternative',       pct: 35, c: '#2aa863' },
    { name: 'Pop',               pct: 34, c: '#e3a83a' },
    { name: 'Electronic',        pct: 24, c: '#d23b2d' },
    { name: 'Adult Alternative', pct: 23, c: '#a78bff' },
    { name: 'Indie Rock',        pct: 20, c: '#3aa3e3' },
    { name: 'Alternative Rock',  pct: 20, c: '#e36b3a' },
    { name: 'Pop/Rock',          pct: 13, c: '#e36ba0' },
  ];
  const topYears = [
    { y: 2017, n: 137 }, { y: 2019, n: 134 }, { y: 2016, n: 131 },
    { y: 2023, n: 122 }, { y: 2025, n: 112 },
  ];
  // synthetic monthly additions (Jan 2016 -> Apr 2026)
  const additionsOverTime = (() => {
    const out = [];
    let y = 2016, m = 1;
    while (!(y === 2026 && m > 4)) {
      // pseudo-random but stable
      const seed = (y * 13 + m * 7) % 97;
      out.push({ y, m, n: 8 + (seed % 35) + (m === 8 ? 30 : 0) + (y === 2017 && m === 1 ? 30 : 0) });
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return out;
  })();
  const monthName = (m) => ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][m - 1];
  const stats2 = {
    totals: { albums: 3218, artists: 1201, genres: 351, perArtist: 2.7 },
    decadeBars, topArtistsBig, topGenresBig, topYears, additionsOverTime,
    goldenYear: { y: 2017, n: 137 },
    activeMonth: { name: 'AUGUST', n: 319 },
    artistDepth: { oneHit: 685, catalog: 156 },
    monthName,
  };

  return {
    albums, artists, scrobbles, stats, stats2,
    tracksFor, blurbFor, idents, artistBio, albumsByArtist,
  };
})();
