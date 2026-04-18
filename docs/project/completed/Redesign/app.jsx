/* global React, ReactDOM */
const { useState, useEffect, useRef } = React;
const { albums, artists, scrobbles, stats } = window.RUSS_DATA;
// Bring globals from pages.jsx
const { Link, useHashRoute, AlbumDetail, ArtistDetail, AlbumsBrowse, ArtistsBrowse, StatsPage, RandomPage, WrappedPage } = window;

// ---------- Tweak persistence ----------
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "tintIntensity": 0.85,
  "showCoverColor": true,
  "density": "sparse",
  "heroVariant": "split",
  "monoLabels": true
}/*EDITMODE-END*/;

const useTweaks = () => {
  const [t, setT] = useState(() => {
    try { return { ...TWEAK_DEFAULTS, ...JSON.parse(localStorage.getItem('russfm.tweaks') || '{}') }; }
    catch { return TWEAK_DEFAULTS; }
  });
  const set = (k, v) => {
    const next = { ...t, [k]: v };
    setT(next);
    localStorage.setItem('russfm.tweaks', JSON.stringify(next));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: v } }, '*');
  };
  return [t, set];
};

// ---------- Drag-scroll wall ----------
const DragWall = ({ children, className = '' }) => {
  const ref = useRef(null);
  const drag = useRef({ down: false, x: 0, sl: 0, moved: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onDown = (e) => {
    drag.current = { down: true, x: e.clientX, sl: ref.current.scrollLeft, moved: 0 };
    ref.current.classList.add('grabbing');
  };
  const onMove = (e) => {
    if (!drag.current.down) return;
    const dx = e.clientX - drag.current.x;
    drag.current.moved = Math.abs(dx);
    ref.current.scrollLeft = drag.current.sl - dx;
  };
  const onUp = () => {
    drag.current.down = false;
    ref.current.classList.remove('grabbing');
    if (drag.current.moved > 6) {
      const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); window.removeEventListener('click', stop, true); };
      window.addEventListener('click', stop, true);
    }
  };

  const scrollBy = (dir) => {
    ref.current.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <div className={`wall-wrap ${className}`}>
      <div ref={ref} className="wall"
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
        {children}
      </div>
      <button className="wall-btn wall-btn--prev" onClick={() => scrollBy(-1)} aria-label="Scroll left">‹</button>
      <button className="wall-btn wall-btn--next" onClick={() => scrollBy(1)} aria-label="Scroll right">›</button>
    </div>
  );
};

const SectionHeader = ({ num, label, count, action, to }) => (
  <header className="sec-head">
    <div className="sec-head__l">
      <span className="sec-head__num">{num}</span>
      <h2 className="sec-head__label">{label}</h2>
      {count != null && <span className="sec-head__count">{String(count).padStart(3, '0')} ITEMS</span>}
    </div>
    {action && <Link to={to || '#'} className="sec-head__a">{action} <span aria-hidden>→</span></Link>}
  </header>
);

// ---------- Hero ----------
const Hero = ({ tweaks }) => {
  const featured = albums.slice(0, 5);
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (hover) return;
    const t = setInterval(() => setI((x) => (x + 1) % featured.length), 7000);
    return () => clearInterval(t);
  }, [hover, featured.length]);

  const a = featured[i];
  const tint = tweaks.showCoverColor ? a.dom : 'var(--ink-dim)';

  return (
    <section className="hero" style={{ '--tint': tint, '--tint-strength': tweaks.tintIntensity }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="hero__wash" />
      <div className="hero__noise" />

      <div className="hero__inner">
        <div className="hero__meta">
          <div className="hero__crumbs">
            <span>FEATURED</span><span>·</span>
            <span>NO. {String(i + 1).padStart(2,'0')} / {String(featured.length).padStart(2,'0')}</span>
            <span>·</span><span>UPDATED {a.added}</span>
          </div>
          <h1 className="hero__title">{a.title}</h1>
          <Link to={`/artist/${a.artist.replace(/\s+/g,'-').toLowerCase()}`} className="hero__artist">
            <span className="hero__artist-rule" /><span>{a.artist}</span>
          </Link>
          <dl className="hero__specs">
            <div><dt>YEAR</dt><dd>{a.year}</dd></div>
            <div><dt>COUNTRY</dt><dd>{a.country}</dd></div>
            <div><dt>FORMAT</dt><dd>{a.format}</dd></div>
            <div><dt>TRACKS</dt><dd>{String(a.tracks).padStart(2,'0')}</dd></div>
            <div><dt>LABEL</dt><dd>{a.label}</dd></div>
            <div><dt>GENRE</dt><dd>{a.genres[0].toUpperCase()}</dd></div>
          </dl>
          <div className="hero__actions">
            <Link to={`/album/${a.id}`} className="btn btn--solid">Open record →</Link>
            <button className="btn btn--ghost">Scrobble</button>
            <button className="btn btn--ghost">Spotify</button>
            <button className="btn btn--ghost">Apple Music</button>
            <button className="btn btn--ghost">Discogs</button>
          </div>
        </div>

        <div className="hero__art">
          <Link to={`/album/${a.id}`} className="hero__sleeve">
            <img src={a.cover} alt="" draggable="false" />
            <span className="hero__catnum">CAT. {a.id.toUpperCase()} · SIDE A/B</span>
          </Link>
          <div className="hero__dots">
            {featured.map((_, n) => (
              <button key={n} className={`hero__dot ${n === i ? 'is-on' : ''}`}
                onClick={() => setI(n)} aria-label={`Featured ${n + 1}`}>
                <span>{String(n + 1).padStart(2, '0')}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hero__ticker" aria-hidden>
        <div className="hero__ticker-inner">
          {[...Array(2)].flatMap((_, k) =>
            featured.map((f, idx) => (
              <span key={`${k}-${idx}`}>
                <em>{String(idx + 1).padStart(2,'0')}</em> {f.artist} — {f.title} <i>·</i>
              </span>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

const AlbumTile = ({ a, idx, tinted }) => (
  <Link className="tile" to={`/album/${a.id}`}>
    <div className="tile__cover" style={tinted ? { '--shadow': a.dom } : undefined}>
      <img src={a.cover} alt="" draggable="false" />
      <div className="tile__hover">
        <span className="tile__hover-row"><em>FORMAT</em><b>{a.format}</b></span>
        <span className="tile__hover-row"><em>TRACKS</em><b>{String(a.tracks).padStart(2,'0')}</b></span>
        <span className="tile__hover-row"><em>YEAR</em><b>{a.year}</b></span>
      </div>
      <span className="tile__cat">{String(idx + 1).padStart(3, '0')}</span>
    </div>
    <div className="tile__meta">
      <h3 className="tile__title">{a.title}</h3>
      <div className="tile__sub"><span>{a.artist}</span><span className="tile__year">{a.year}</span></div>
    </div>
  </Link>
);

const ArtistTile = ({ a, idx, tinted }) => (
  <Link className="atile" to={`/artist/${a.name.replace(/\s+/g,'-').toLowerCase()}`}>
    <div className="atile__photo" style={tinted ? { '--shadow': a.dom } : undefined}>
      <img src={a.photo} alt="" draggable="false" />
    </div>
    <div className="atile__meta">
      <span className="atile__num">{String(idx + 1).padStart(2,'0')}</span>
      <div>
        <h3 className="atile__name">{a.name}</h3>
        <div className="atile__sub">{a.albums} releases · {a.country}</div>
      </div>
    </div>
  </Link>
);

const CatalogStrip = () => (
  <div className="catalog">
    <div className="catalog__head">
      <span>#</span><span>TITLE</span><span>ARTIST</span><span>YEAR</span>
      <span>FORMAT</span><span>GENRE</span><span className="catalog__r">ADDED</span>
    </div>
    {albums.slice(0, 8).map((a, i) => (
      <Link key={a.id} to={`/album/${a.id}`} className="catalog__row">
        <span className="catalog__n">{String(i + 1).padStart(3, '0')}</span>
        <span className="catalog__t">
          <span className="catalog__sw" style={{ background: a.dom }} />{a.title}
        </span>
        <span className="catalog__a">{a.artist}</span>
        <span>{a.year}</span><span>{a.format}</span><span>{a.genres[0]}</span>
        <span className="catalog__r catalog__d">{a.added}</span>
      </Link>
    ))}
  </div>
);

const StatsAside = () => {
  const max = Math.max(...stats.yearsHist.map((y) => y.n));
  return (
    <aside className="aside">
      <div className="aside__block">
        <div className="aside__head">RUSS.FM / INDEX</div>
        <dl className="aside__nums">
          <div><dt>RECORDS</dt><dd>{stats.albums.toLocaleString()}</dd></div>
          <div><dt>ARTISTS</dt><dd>{stats.artists}</dd></div>
          <div><dt>TRACKS</dt><dd>{stats.tracks.toLocaleString()}</dd></div>
          <div><dt>HOURS</dt><dd>{stats.hours}</dd></div>
        </dl>
      </div>
      <div className="aside__block">
        <div className="aside__head">DECADES</div>
        <div className="hist">
          {stats.yearsHist.map((y) => (
            <div key={y.d} className="hist__row">
              <span className="hist__d">{y.d}</span>
              <span className="hist__bar"><span style={{ width: `${(y.n / max) * 100}%` }} /></span>
              <span className="hist__n">{String(y.n).padStart(3,'0')}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="aside__block">
        <div className="aside__head">RECENTLY SCROBBLED · LAST.FM</div>
        <ol className="scrob">
          {scrobbles.map((s, i) => (
            <li key={i} className="scrob__row">
              <span className="scrob__when">{s.when}</span>
              <span className="scrob__t">{s.track}</span>
              <span className="scrob__a">{s.artist}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="aside__block">
        <div className="aside__head">TOP GENRES</div>
        <div className="genres">
          {stats.topGenres.map((g) => (
            <a key={g.name} href="#" className="genre"><span>{g.name}</span><b>{g.count}</b></a>
          ))}
        </div>
      </div>
    </aside>
  );
};

// ---------- Top bar / footer ----------
const NAV = [
  { to: '/', label: 'Home' },
  { to: '/albums', label: 'Albums' },
  { to: '/artists', label: 'Artists' },
  { to: '/stats', label: 'Stats' },
  { to: '/random', label: 'Random' },
  { to: '/wrapped', label: 'Wrapped' },
  { to: '/fuzzbox', label: 'Fuzzbox' },
];

const TopBar = ({ theme, onTheme, route }) => {
  const isActive = (to) => {
    if (to === '/') return route === '/' || route === '';
    return route.startsWith(to);
  };
  return (
    <header className="top">
      <Link to="/" className="top__brand">
        <span className="top__mark">◉</span>
        <span className="top__name">russ.fm</span>
        <span className="top__tag">/ PERSONAL RECORD COLLECTION</span>
      </Link>
      <nav className="top__nav">
        {NAV.map(n => (
          <Link key={n.to} to={n.to} className={isActive(n.to) ? 'is-on' : ''}>{n.label}</Link>
        ))}
      </nav>
      <div className="top__r">
        <label className="top__search">
          <span>⌕</span>
          <input placeholder="Search records, artists, tracks…" />
          <kbd>/</kbd>
        </label>
        <button className="top__theme" onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </header>
  );
};

const Footer = () => (
  <footer className="foot">
    <div className="foot__l">
      <span>© 2026 RUSS.FM</span><span>·</span>
      <span>A PERSONAL RECORD COLLECTION SHOWCASE</span>
    </div>
    <div className="foot__r">
      <Link to="/stats">Collection Stats</Link>
      <Link to="/random">Random Discovery</Link>
      <Link to="/albums">Albums</Link>
      <Link to="/artists">Artists</Link>
      <a href="#">RSS</a><a href="#">JSON</a>
    </div>
  </footer>
);

// ---------- Tweaks panel ----------
const Tweaks = ({ tweaks, set, visible }) => {
  if (!visible) return null;
  return (
    <div className="tweaks">
      <div className="tweaks__head"><b>Tweaks</b><span>russ.fm redesign</span></div>
      <div className="tweaks__row">
        <label>Theme</label>
        <div className="seg">
          {['light','dark'].map(v => (
            <button key={v} className={tweaks.theme === v ? 'is-on' : ''} onClick={() => set('theme', v)}>{v}</button>
          ))}
        </div>
      </div>
      <div className="tweaks__row">
        <label>Cover-color tinting</label>
        <div className="seg">
          <button className={tweaks.showCoverColor ? 'is-on' : ''} onClick={() => set('showCoverColor', true)}>on</button>
          <button className={!tweaks.showCoverColor ? 'is-on' : ''} onClick={() => set('showCoverColor', false)}>off</button>
        </div>
      </div>
      <div className="tweaks__row">
        <label>Tint intensity <i>{Math.round(tweaks.tintIntensity * 100)}%</i></label>
        <input type="range" min="0" max="1" step="0.05" value={tweaks.tintIntensity}
          onChange={(e) => set('tintIntensity', parseFloat(e.target.value))} />
      </div>
      <div className="tweaks__row">
        <label>Density</label>
        <div className="seg">
          {['sparse','medium','dense'].map(v => (
            <button key={v} className={tweaks.density === v ? 'is-on' : ''} onClick={() => set('density', v)}>{v}</button>
          ))}
        </div>
      </div>
      <div className="tweaks__row">
        <label>Mono labels</label>
        <div className="seg">
          <button className={tweaks.monoLabels ? 'is-on' : ''} onClick={() => set('monoLabels', true)}>on</button>
          <button className={!tweaks.monoLabels ? 'is-on' : ''} onClick={() => set('monoLabels', false)}>off</button>
        </div>
      </div>
    </div>
  );
};

// ---------- Home ----------
const Home = ({ tweaks }) => (
  <>
    <Hero tweaks={tweaks} />
    <main className="layout">
      <div className="layout__main">
        <section className="block" data-screen-label="Recently Added Albums">
          <SectionHeader num="01" label="Recently Added · Albums" count={albums.length} action="View all" to="/albums" />
          <DragWall>
            {albums.map((a, i) => (
              <AlbumTile key={a.id} a={a} idx={i} tinted={tweaks.showCoverColor} />
            ))}
          </DragWall>
        </section>

        <section className="block" data-screen-label="Recently Added Artists">
          <SectionHeader num="02" label="Recently Added · Artists" count={artists.length} action="View all" to="/artists" />
          <DragWall className="wall--artist">
            {artists.map((a, i) => (
              <ArtistTile key={a.id} a={a} idx={i} tinted={tweaks.showCoverColor} />
            ))}
          </DragWall>
        </section>

        <section className="block" data-screen-label="Catalog">
          <SectionHeader num="03" label="Catalog · Latest Acquisitions" action="Browse full catalog" to="/albums" />
          <CatalogStrip />
        </section>

        <section className="block" data-screen-label="Random Spin">
          <SectionHeader num="04" label="Random Spin · This Week" />
          <div className="random">
            {albums.slice(2, 6).map((a, i) => (
              <Link key={a.id} to={`/album/${a.id}`} className="random__card" style={{ '--c': a.dom }}>
                <div className="random__n">SPIN.{String(i + 1).padStart(2,'0')}</div>
                <img src={a.cover} alt="" />
                <div className="random__meta">
                  <h4>{a.title}</h4>
                  <p>{a.artist} · {a.year}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <StatsAside />
    </main>
  </>
);

// ---------- Router ----------
const Stub = ({ title }) => (
  <div className="page page--stub">
    <h1 className="browse__title">{title}</h1>
    <p className="prose">This section is coming next. Pop back to <Link to="/">Home</Link>, <Link to="/albums">Albums</Link>, or <Link to="/artists">Artists</Link>.</p>
  </div>
);

// ---------- App ----------
const App = () => {
  const [tweaks, set] = useTweaks();
  const [tweaksVisible, setTweaksVisible] = useState(false);
  const route = useHashRoute();

  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksVisible(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksVisible(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  let view;
  if (route === '/' || route === '') view = <Home tweaks={tweaks} />;
  else if (route === '/albums') view = <AlbumsBrowse tweaks={tweaks} />;
  else if (route === '/artists') view = <ArtistsBrowse tweaks={tweaks} />;
  else if (route.startsWith('/album/')) view = <AlbumDetail id={route.split('/')[2]} tweaks={tweaks} />;
  else if (route.startsWith('/artist/')) view = <ArtistDetail slug={route.split('/')[2]} tweaks={tweaks} />;
  else if (route === '/stats') view = <StatsPage tweaks={tweaks} />;
  else if (route === '/random') view = <RandomPage tweaks={tweaks} />;
  else if (route === '/wrapped') view = <WrappedPage tweaks={tweaks} />;
  else if (route === '/fuzzbox') view = <Stub title="Fuzzbox" />;
  else view = <Stub title="Not found" />;

  useEffect(() => {
    const r = document.documentElement;
    r.classList.toggle('theme--dark', tweaks.theme === 'dark');
    r.classList.toggle('theme--light', tweaks.theme !== 'dark');
  }, [tweaks.theme]);

  return (
    <div className={`app theme--${tweaks.theme} dens--${tweaks.density} ${tweaks.monoLabels ? 'mono-on' : 'mono-off'}`}>
      <TopBar theme={tweaks.theme} onTheme={(v) => set('theme', v)} route={route} />
      {view}
      <Footer />
      <Tweaks tweaks={tweaks} set={set} visible={tweaksVisible} />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
