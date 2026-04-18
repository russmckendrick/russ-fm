/* global React */
const { useState, useEffect, useRef } = React;

// ===========================================================
// Shared bits used across pages
// ===========================================================

window.useHashRoute = function useHashRoute() {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const onHash = () => {
      setRoute(window.location.hash.slice(1) || '/');
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
};

window.Link = function Link({ to, children, className, style, onClick }) {
  return (
    <a href={`#${to}`} className={className} style={style} onClick={onClick}>
      {children}
    </a>
  );
};

// ===========================================================
// Album detail
// ===========================================================
window.AlbumDetail = function AlbumDetail({ id, tweaks }) {
  const { albums, tracksFor, blurbFor, idents, albumsByArtist } = window.RUSS_DATA;
  const a = albums.find(x => x.id === id) || albums[0];
  const tracks = tracksFor(a);
  const ident = idents(a);
  const more = albumsByArtist(a.artist).filter(x => x.id !== a.id);
  const tint = tweaks.showCoverColor ? a.dom : 'var(--ink-dim)';

  return (
    <div className="page page--album" style={{ '--tint': tint, '--tint-strength': tweaks.tintIntensity }}>
      <div className="adet">
        <div className="adet__wash" />
        <div className="adet__inner">
          <div className="adet__sleeve">
            <img src={a.cover} alt="" draggable="false" />
            <span className="adet__catnum">CAT. {a.id.toUpperCase()} · {a.format}</span>
          </div>
          <div className="adet__meta">
            <div className="crumbs">
              <Link to="/">Home</Link>
              <span>/</span>
              <Link to="/albums">Albums</Link>
              <span>/</span>
              <span>{a.title}</span>
            </div>
            <h1 className="adet__title">{a.title}</h1>
            <Link to={`/artist/${a.artist.replace(/\s+/g,'-').toLowerCase()}`} className="adet__artist">
              <span className="adet__rule" />{a.artist}
            </Link>

            <div className="chip-row">
              {a.genres.map(g => <span key={g} className="chip">{g}</span>)}
              <span className="chip chip--mono">{a.year}</span>
              <span className="chip chip--mono">{a.country}</span>
              <span className="chip chip--mono">{a.tracks} TRACKS</span>
            </div>

            <div className="adet__actions">
              <button className="btn btn--solid">Play on Spotify</button>
              <button className="btn btn--ghost">Apple Music</button>
              <button className="btn btn--ghost">Last.fm Scrobble</button>
              <button className="btn btn--ghost">Discogs</button>
            </div>
          </div>
        </div>
      </div>

      <div className="adet__body">
        <div className="adet__cols">
          <div className="adet__main">
            <section className="block">
              <div className="sec-mini">ABOUT</div>
              <p className="prose">{blurbFor(a)}</p>
              <p className="prose">
                Catalogued under {a.label}, this pressing was added to the collection on {a.added}.
                Adjacent in the archive: {more.length ? more.map(m => m.title).join(', ') : 'no other releases by this artist yet.'}
              </p>
            </section>

            <section className="block">
              <div className="sec-mini">TRACKLIST</div>
              <div className="tracklist">
                {tracks.map(side => (
                  <div key={side.side} className="tracklist__side">
                    <div className="tracklist__head">SIDE {side.side}</div>
                    <ol className="tracklist__list">
                      {side.items.map(t => (
                        <li key={t.n} className="tracklist__row">
                          <span className="tracklist__n">{String(t.n).padStart(2,'0')}</span>
                          <span className="tracklist__t">{t.name}</span>
                          <span className="tracklist__d">{t.time}</span>
                          <button className="tracklist__play" aria-label="Preview">▶</button>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </section>

            {more.length > 0 && (
              <section className="block">
                <div className="sec-mini">MORE FROM {a.artist.toUpperCase()}</div>
                <div className="mini-row">
                  {more.map((m, i) => (
                    <Link key={m.id} to={`/album/${m.id}`} className="tile">
                      <div className="tile__cover" style={tweaks.showCoverColor ? { '--shadow': m.dom } : undefined}>
                        <img src={m.cover} alt="" draggable="false" />
                        <span className="tile__cat">{String(i + 1).padStart(3,'0')}</span>
                      </div>
                      <div className="tile__meta">
                        <h3 className="tile__title">{m.title}</h3>
                        <div className="tile__sub"><span>{m.artist}</span><span className="tile__year">{m.year}</span></div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="adet__side">
            <div className="aside__block">
              <div className="aside__head">RELEASE DETAILS</div>
              <dl className="kv">
                <div><dt>YEAR</dt><dd>{a.year}</dd></div>
                <div><dt>COUNTRY</dt><dd>{a.country}</dd></div>
                <div><dt>FORMAT</dt><dd>{a.format}</dd></div>
                <div><dt>LABEL</dt><dd>{a.label}</dd></div>
                <div><dt>STYLE</dt><dd>{a.genres[0]}</dd></div>
                <div><dt>ADDED</dt><dd>{a.added}</dd></div>
              </dl>
            </div>

            <div className="aside__block">
              <div className="aside__head">IDENTIFIERS</div>
              <dl className="kv kv--mono">
                <div><dt>UPC</dt><dd>{ident.upc}</dd></div>
                <div><dt>DISCOGS</dt><dd>{ident.discogs}</dd></div>
                <div><dt>SPOTIFY</dt><dd className="kv__trunc">{ident.spotify}</dd></div>
                <div><dt>APPLE</dt><dd>{ident.apple}</dd></div>
              </dl>
            </div>

            <div className="aside__block">
              <div className="aside__head">COPYRIGHT</div>
              <p className="copy">© {a.year} under exclusive license to {a.label}, {a.artist} Ltd.</p>
              <p className="copy">℗ {a.year} under exclusive license to {a.label}, {a.artist} Ltd.</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

// ===========================================================
// Artist detail
// ===========================================================
window.ArtistDetail = function ArtistDetail({ slug, tweaks }) {
  const { artists, albumsByArtist, artistBio } = window.RUSS_DATA;
  const ar = artists.find(x => x.name.replace(/\s+/g,'-').toLowerCase() === slug) || artists[0];
  const records = albumsByArtist(ar.name);
  const tint = tweaks.showCoverColor ? ar.dom : 'var(--ink-dim)';

  return (
    <div className="page page--artist" style={{ '--tint': tint, '--tint-strength': tweaks.tintIntensity }}>
      <div className="ardet">
        <div className="ardet__wash" />
        <div className="ardet__inner">
          <div className="crumbs crumbs--light">
            <Link to="/">Home</Link>
            <span>/</span>
            <Link to="/artists">Artists</Link>
            <span>/</span>
            <span>{ar.name}</span>
          </div>
          <div className="ardet__row">
            <div className="ardet__photo">
              <img src={ar.photo} alt="" draggable="false" />
            </div>
            <div className="ardet__meta">
              <div className="ardet__kicker">ARTIST · NO. {ar.id.toUpperCase()}</div>
              <h1 className="ardet__name">{ar.name}</h1>
              <dl className="ardet__nums">
                <div><dt>RELEASES</dt><dd>{records.length || ar.albums}</dd></div>
                <div><dt>COUNTRY</dt><dd>{ar.country}</dd></div>
                <div><dt>FIRST ADDED</dt><dd>{(records[records.length - 1] || { added: '—' }).added}</dd></div>
                <div><dt>LATEST</dt><dd>{(records[0] || { added: '—' }).added}</dd></div>
              </dl>
              <div className="ardet__actions">
                <button className="btn btn--solid">Open on Last.fm</button>
                <button className="btn btn--ghost">Spotify Artist</button>
                <button className="btn btn--ghost">Discogs Profile</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="adet__body">
        <div className="adet__cols">
          <div className="adet__main">
            <section className="block">
              <div className="sec-mini">BIOGRAPHY</div>
              <p className="prose">{artistBio(ar)}</p>
            </section>

            <section className="block">
              <div className="sec-mini">RELEASES IN COLLECTION · {String(records.length).padStart(2,'0')}</div>
              {records.length === 0 ? (
                <div className="empty">No catalogued releases. Check back after the next crate dig.</div>
              ) : (
                <div className="catalog">
                  <div className="catalog__head">
                    <span>#</span><span>TITLE</span><span>YEAR</span><span>FORMAT</span><span>GENRE</span><span className="catalog__r">ADDED</span>
                  </div>
                  {records.map((m, i) => (
                    <Link key={m.id} to={`/album/${m.id}`} className="catalog__row catalog__row--artist">
                      <span className="catalog__n">{String(i + 1).padStart(3, '0')}</span>
                      <span className="catalog__t">
                        <span className="catalog__sw" style={{ background: m.dom }} />
                        {m.title}
                      </span>
                      <span>{m.year}</span>
                      <span>{m.format}</span>
                      <span>{m.genres[0]}</span>
                      <span className="catalog__r catalog__d">{m.added}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="block">
              <div className="sec-mini">RELATED ARTISTS</div>
              <div className="mini-row">
                {artists.filter(x => x.id !== ar.id).slice(0, 6).map((x, i) => (
                  <Link key={x.id} to={`/artist/${x.name.replace(/\s+/g,'-').toLowerCase()}`} className="atile">
                    <div className="atile__photo" style={tweaks.showCoverColor ? { '--shadow': x.dom } : undefined}>
                      <img src={x.photo} alt="" />
                    </div>
                    <div className="atile__meta">
                      <span className="atile__num">{String(i + 1).padStart(2,'0')}</span>
                      <div>
                        <h3 className="atile__name">{x.name}</h3>
                        <div className="atile__sub">{x.albums} releases · {x.country}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <aside className="adet__side">
            <div className="aside__block">
              <div className="aside__head">QUICK FACTS</div>
              <dl className="kv">
                <div><dt>FORMED</dt><dd>{1965 + (ar.id.charCodeAt(2) % 50)}</dd></div>
                <div><dt>ORIGIN</dt><dd>{ar.country}</dd></div>
                <div><dt>RELEASES</dt><dd>{records.length || ar.albums}</dd></div>
                <div><dt>STATUS</dt><dd>Active</dd></div>
              </dl>
            </div>
            <div className="aside__block">
              <div className="aside__head">EXTERNAL</div>
              <ul className="ext">
                <li><a href="#">Last.fm Profile →</a></li>
                <li><a href="#">Discogs →</a></li>
                <li><a href="#">Spotify →</a></li>
                <li><a href="#">MusicBrainz →</a></li>
                <li><a href="#">Wikipedia →</a></li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

// ===========================================================
// Stats page
// ===========================================================
window.StatsPage = function StatsPage({ tweaks }) {
  const { albums, artists, stats2 } = window.RUSS_DATA;
  const featured = albums[0]; // for hero tint + sleeve stack
  const tint = tweaks.showCoverColor ? featured.dom : 'var(--ink-dim)';
  const maxBar = Math.max(...stats2.decadeBars.map(d => d.n));
  const maxAdd = Math.max(...stats2.additionsOverTime.map(a => a.n));

  // Donut math
  const total = stats2.topGenresBig.reduce((s, g) => s + g.pct, 0);
  let acc = 0;
  const donut = stats2.topGenresBig.map(g => {
    const start = (acc / total) * 100;
    acc += g.pct;
    const end = (acc / total) * 100;
    return { ...g, start, end };
  });

  return (
    <div className="page page--stats" style={{ '--tint': tint, '--tint-strength': tweaks.tintIntensity }}>
      {/* hero */}
      <header className="stats-hero">
        <div className="stats-hero__wash" />
        <div className="stats-hero__inner">
          <div className="stats-hero__stack">
            {[2,1,0].map(i => (
              <div key={i} className="stats-hero__sleeve" style={{ '--i': i }}>
                <img src={albums[i + 6].cover} alt="" />
              </div>
            ))}
          </div>
          <div className="stats-hero__meta">
            <div className="stats-hero__kicker">SECTION 04 · INDEX</div>
            <h1 className="stats-hero__title">
              Collection <em>Statistics</em>
            </h1>
            <p className="stats-hero__sub">
              Real-time insights from my listening habits. {stats2.totals.albums.toLocaleString()} albums across {stats2.totals.genres} genres, last updated 12 APR 26.
            </p>
            <div className="stats-hero__pills">
              <span className="chip chip--mono">◉ {stats2.totals.albums.toLocaleString()} ALBUMS</span>
              <span className="chip chip--mono">◐ {stats2.totals.artists.toLocaleString()} ARTISTS</span>
              <span className="chip chip--mono">♪ {stats2.totals.genres} GENRES</span>
            </div>
            <div className="chip-row" style={{ marginTop: 8 }}>
              {stats2.topGenresBig.slice(0, 4).map(g => (
                <span key={g.name} className="chip" style={{ borderColor: g.c, color: g.c }}>{g.name}</span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="stats-body">
        {/* big totals */}
        <section className="stat-grid stat-grid--totals">
          {[
            { l: 'TOTAL ALBUMS', n: stats2.totals.albums.toLocaleString(), s: '◉' },
            { l: 'UNIQUE ARTISTS', n: stats2.totals.artists.toLocaleString(), s: '◐' },
            { l: 'UNIQUE GENRES', n: stats2.totals.genres.toLocaleString(), s: '♪' },
            { l: 'AVG ALBUMS / ARTIST', n: stats2.totals.perArtist, s: '↗' },
          ].map(c => (
            <div key={c.l} className="card card--total">
              <div className="card__head"><span>{c.l}</span><i>{c.s}</i></div>
              <div className="card__big">{c.n}</div>
            </div>
          ))}
        </section>

        {/* charts row */}
        <section className="stat-grid stat-grid--two">
          <div className="card">
            <div className="card__head"><span>ALBUMS BY DECADE</span><i>↻</i></div>
            <div className="bars">
              {stats2.decadeBars.map(d => (
                <div key={d.d} className="bars__col">
                  <div className="bars__bar" style={{ height: `${(d.n / maxBar) * 100}%`, background: d.c }}>
                    <span className="bars__n">{d.n}</span>
                  </div>
                  <div className="bars__d">{d.d}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card__head"><span>TOP GENRES</span><i>%</i></div>
            <div className="donut-row">
              <svg viewBox="-120 -120 240 240" className="donut" aria-hidden>
                {donut.map((g, i) => {
                  const r = 90, ir = 60;
                  const a1 = (g.start / 100) * Math.PI * 2 - Math.PI / 2;
                  const a2 = (g.end / 100) * Math.PI * 2 - Math.PI / 2;
                  const large = (g.end - g.start) > 50 ? 1 : 0;
                  const x1 = Math.cos(a1) * r, y1 = Math.sin(a1) * r;
                  const x2 = Math.cos(a2) * r, y2 = Math.sin(a2) * r;
                  const x3 = Math.cos(a2) * ir, y3 = Math.sin(a2) * ir;
                  const x4 = Math.cos(a1) * ir, y4 = Math.sin(a1) * ir;
                  return (
                    <path key={i} d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${ir} ${ir} 0 ${large} 0 ${x4} ${y4} Z`}
                      fill={g.c} stroke="var(--paper)" strokeWidth="2"/>
                  );
                })}
              </svg>
              <ul className="donut__legend">
                {stats2.topGenresBig.map(g => (
                  <li key={g.name}>
                    <span className="dot" style={{ background: g.c }} />
                    <span className="donut__name">{g.name}</span>
                    <span className="donut__pct">{g.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* golden year + top years */}
        <section className="stat-grid stat-grid--two">
          <div className="card card--golden">
            <div className="card__head"><span>GOLDEN YEAR</span><i>↗</i></div>
            <div className="golden">
              <div className="golden__y">{stats2.goldenYear.y}</div>
              <div className="golden__sub">Most prolific year with <b>{stats2.goldenYear.n}</b> albums released</div>
            </div>
          </div>

          <div className="card">
            <div className="card__head"><span>TOP 5 RELEASE YEARS</span><i>★</i></div>
            <ul className="topyrs">
              {stats2.topYears.map((y) => {
                const pct = (y.n / stats2.topYears[0].n) * 100;
                return (
                  <li key={y.y} className="topyrs__row">
                    <span className="topyrs__y">{y.y}</span>
                    <span className="topyrs__bar"><span style={{ width: `${pct}%` }} /></span>
                    <span className="topyrs__n">{y.n} albums</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* artists with most albums */}
        <section className="block">
          <div className="sec-mini">ARTISTS WITH MOST ALBUMS</div>
          <div className="topartists">
            {stats2.topArtistsBig.slice(0, 8).map((a, i) => {
              const photo = artists.find(x => x.name === a.name)?.photo
                || artists[i % artists.length].photo;
              return (
                <Link key={a.name} to={`/artist/${a.name.replace(/\s+/g,'-').toLowerCase()}`} className="topartist">
                  <div className="topartist__rank">#{String(i + 1).padStart(2,'0')}</div>
                  <div className="topartist__photo" style={{ '--shadow': a.dom }}>
                    <img src={photo} alt="" />
                  </div>
                  <h3 className="topartist__name">{a.name}</h3>
                  <div className="topartist__sub">{a.n} albums</div>
                  <div className="topartist__sw">
                    {[0,1,2,3].map(k => (
                      <span key={k} style={{ background: albums[(i*3 + k) % albums.length].dom }} />
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* artist depth + most active month */}
        <section className="stat-grid stat-grid--two">
          <div className="card">
            <div className="card__head"><span>ARTIST DEPTH</span><i>⬢</i></div>
            <ul className="depth">
              <li>
                <div>
                  <h4>One Hit Wonders</h4>
                  <p>Artists with 1 album in collection</p>
                </div>
                <b>{stats2.artistDepth.oneHit}</b>
              </li>
              <li>
                <div>
                  <h4>Catalog Artists</h4>
                  <p>Artists with 5+ albums in collection</p>
                </div>
                <b>{stats2.artistDepth.catalog}</b>
              </li>
            </ul>
          </div>

          <div className="card card--active">
            <div className="card__head"><span>MOST ACTIVE MONTH</span><i>⬡</i></div>
            <div className="active">
              <div>
                <div className="active__name">{stats2.activeMonth.name}</div>
                <p>You typically add the most music in {stats2.activeMonth.name.toLowerCase()}.</p>
              </div>
              <div className="active__n">
                <b>{stats2.activeMonth.n}</b>
                <span>TOTAL ADDITIONS</span>
              </div>
            </div>
          </div>
        </section>

        {/* recent additions */}
        <section className="block">
          <div className="sec-mini">RECENT ADDITIONS</div>
          <div className="recents">
            {albums.slice(0, 10).map((a, i) => (
              <Link key={a.id} to={`/album/${a.id}`} className="tile">
                <div className="tile__cover" style={tweaks.showCoverColor ? { '--shadow': a.dom } : undefined}>
                  <img src={a.cover} alt="" draggable="false" />
                  <span className="tile__cat">{String(i + 1).padStart(3,'0')}</span>
                </div>
                <div className="tile__meta">
                  <h3 className="tile__title">{a.title}</h3>
                  <div className="tile__sub"><span>{a.artist}</span><span className="tile__year">{a.year}</span></div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* additions over time */}
        <section className="block">
          <div className="card">
            <div className="card__head"><span>ADDITIONS OVER TIME</span><i>2016 → 2026</i></div>
            <div className="timehist">
              {stats2.additionsOverTime.map((p, i) => {
                const c = stats2.decadeBars[Math.min(6, Math.floor((p.y - 2010) / 1.5) % 7)].c;
                return (
                  <div key={i} className="timehist__col" title={`${stats2.monthName(p.m)} ${p.y} · ${p.n}`}>
                    <span className="timehist__bar" style={{ height: `${(p.n / maxAdd) * 100}%`, background: c }} />
                    {p.m === 1 && <span className="timehist__y">{p.y}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* From the crates */}
        <section className="block">
          <div className="sec-mini">FROM THE CRATES · RANDOM PICKS</div>
          <div className="recents">
            {albums.slice(8, 18).map((a, i) => (
              <Link key={a.id} to={`/album/${a.id}`} className="tile">
                <div className="tile__cover" style={tweaks.showCoverColor ? { '--shadow': a.dom } : undefined}>
                  <img src={a.cover} alt="" draggable="false" />
                </div>
                <div className="tile__meta">
                  <h3 className="tile__title">{a.title}</h3>
                  <div className="tile__sub"><span>{a.artist}</span><span className="tile__year">{a.year}</span></div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* random artists */}
        <section className="block">
          <div className="sec-mini">RANDOM ARTISTS</div>
          <div className="browse__agrid">
            {artists.slice(0, 8).map((a, i) => (
              <Link key={a.id} to={`/artist/${a.name.replace(/\s+/g,'-').toLowerCase()}`} className="atile atile--lg">
                <div className="atile__photo" style={tweaks.showCoverColor ? { '--shadow': a.dom } : undefined}>
                  <img src={a.photo} alt="" />
                </div>
                <div className="atile__meta">
                  <span className="atile__num">{String(i + 1).padStart(2,'0')}</span>
                  <div>
                    <h3 className="atile__name">{a.name}</h3>
                    <div className="atile__sub">{a.albums} releases · {a.country}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

// ===========================================================
// Random page
// ===========================================================
window.RandomPage = function RandomPage({ tweaks }) {
  const { albums } = window.RUSS_DATA;
  const [pick, setPick] = useState(() => albums[Math.floor(Math.random() * albums.length)]);
  const [rolling, setRolling] = useState(false);

  const spin = () => {
    setRolling(true);
    let n = 0;
    const id = setInterval(() => {
      setPick(albums[Math.floor(Math.random() * albums.length)]);
      n++;
      if (n > 14) {
        clearInterval(id);
        setRolling(false);
      }
    }, 70);
  };

  useEffect(() => {
    const onKey = (e) => { if (e.code === 'Space') { e.preventDefault(); spin(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tint = tweaks.showCoverColor ? pick.dom : 'var(--ink-dim)';

  return (
    <div className="page page--random" style={{ '--tint': tint, '--tint-strength': tweaks.tintIntensity }}>
      <div className="random-page__wash" />
      <div className="random-page__inner">
        <div className="random-page__kicker">RANDOM DISCOVERY · CRATE DIG</div>

        <div className="random-page__row">
          <div className={`random-page__sleeve ${rolling ? 'is-rolling' : ''}`}>
            <img src={pick.cover} alt="" />
            <span className="random-page__catnum">CAT. {pick.id.toUpperCase()} · {pick.format}</span>
          </div>

          <div className="random-page__meta">
            <h1 className="random-page__title">{pick.title}</h1>
            <Link to={`/artist/${pick.artist.replace(/\s+/g,'-').toLowerCase()}`} className="random-page__artist">
              by <b>{pick.artist}</b>
            </Link>

            <div className="chip-row">
              <span className="chip chip--mono">{pick.year}</span>
              {pick.genres.map(g => <span key={g} className="chip">{g}</span>)}
              <span className="chip chip--mono">{pick.country}</span>
              <span className="chip chip--mono">{pick.format}</span>
            </div>

            <div className="random-page__actions">
              <button className="btn btn--solid" onClick={spin} disabled={rolling}>
                ⤬ {rolling ? 'Spinning…' : 'Shuffle'}
              </button>
              <Link to={`/album/${pick.id}`} className="btn btn--ghost">View album →</Link>
            </div>

            <div className="random-page__hint">
              <kbd>Space</kbd> to shuffle · {albums.length} possibilities
            </div>
          </div>
        </div>

        <div className="random-page__strip">
          <span className="sec-mini" style={{ borderBottom: 0, marginBottom: 0 }}>NEXT UP IF YOU SHUFFLE</span>
          <div className="random-page__peek">
            {albums.slice(4, 12).map(a => (
              <div key={a.id} className="random-page__peek-tile" style={{ background: a.dom }}>
                <img src={a.cover} alt="" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ===========================================================
// Wrapped page (year-in-review)
// ===========================================================
window.WrappedPage = function WrappedPage({ tweaks }) {
  const { albums, artists } = window.RUSS_DATA;
  const yr = 2025;
  const tint = tweaks.showCoverColor ? '#d23b2d' : 'var(--ink-dim)';

  return (
    <div className="page page--wrapped" style={{ '--tint': tint, '--tint-strength': tweaks.tintIntensity }}>
      <header className="wrapped-hero">
        <div className="wrapped-hero__wash" />
        <div className="wrapped-hero__inner">
          <div className="wrapped-hero__kicker">YEAR IN REVIEW</div>
          <h1 className="wrapped-hero__title">
            <span className="wrapped-hero__yr">{yr}</span>
            <span className="wrapped-hero__word">Wrapped</span>
          </h1>
          <p className="wrapped-hero__sub">
            A look back at the records that defined the year in the russ.fm collection.
          </p>
        </div>
      </header>

      <div className="wrapped-body">
        <section className="stat-grid stat-grid--totals">
          {[
            { l: 'NEW ADDITIONS',   n: '184', s: '+' },
            { l: 'PEAK MONTH',      n: 'AUG', s: '↗' },
            { l: 'TOP GENRE',       n: 'Indie', s: '♪' },
            { l: 'NEW ARTISTS',     n: '47',  s: '✦' },
          ].map(c => (
            <div key={c.l} className="card card--total">
              <div className="card__head"><span>{c.l}</span><i>{c.s}</i></div>
              <div className="card__big">{c.n}</div>
            </div>
          ))}
        </section>

        <section className="block">
          <div className="sec-mini">ALBUM OF THE YEAR</div>
          <Link to={`/album/${albums[3].id}`} className="aoty">
            <div className="aoty__sleeve" style={{ '--c': albums[3].dom }}>
              <img src={albums[3].cover} alt="" />
            </div>
            <div className="aoty__meta">
              <div className="aoty__rank">#01</div>
              <h2 className="aoty__title">{albums[3].title}</h2>
              <p className="aoty__artist">{albums[3].artist} · {albums[3].year}</p>
              <p className="prose">
                The standout pressing of {yr}. Catalogued under {albums[3].label}, it became
                the most-returned-to record across the year — both for late-night listens and
                for sharing with friends.
              </p>
              <div className="chip-row">
                {albums[3].genres.map(g => <span key={g} className="chip">{g}</span>)}
              </div>
            </div>
          </Link>
        </section>

        <section className="block">
          <div className="sec-mini">TOP TEN OF {yr}</div>
          <ol className="topten">
            {albums.slice(0, 10).map((a, i) => (
              <li key={a.id} className="topten__row">
                <span className="topten__n">{String(i + 1).padStart(2,'0')}</span>
                <div className="topten__cover" style={{ background: a.dom }}>
                  <img src={a.cover} alt="" />
                </div>
                <div className="topten__meta">
                  <Link to={`/album/${a.id}`} className="topten__t">{a.title}</Link>
                  <div className="topten__a">{a.artist} · {a.year}</div>
                </div>
                <div className="topten__bar"><span style={{ width: `${100 - i * 7}%`, background: a.dom }} /></div>
                <div className="topten__plays">{420 - i * 28} plays</div>
              </li>
            ))}
          </ol>
        </section>

        <section className="block">
          <div className="sec-mini">NEW DISCOVERIES · ARTISTS HEARD FOR THE FIRST TIME</div>
          <div className="browse__agrid">
            {artists.slice(0, 4).map((a, i) => (
              <Link key={a.id} to={`/artist/${a.name.replace(/\s+/g,'-').toLowerCase()}`} className="atile atile--lg">
                <div className="atile__photo" style={tweaks.showCoverColor ? { '--shadow': a.dom } : undefined}>
                  <img src={a.photo} alt="" />
                </div>
                <div className="atile__meta">
                  <span className="atile__num">{String(i + 1).padStart(2,'0')}</span>
                  <div>
                    <h3 className="atile__name">{a.name}</h3>
                    <div className="atile__sub">First heard · {a.country}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

// ===========================================================
// Albums browse
// ===========================================================
window.AlbumsBrowse = function AlbumsBrowse({ tweaks }) {
  const { albums } = window.RUSS_DATA;
  const [view, setView] = useState('grid');
  const [sort, setSort] = useState('added');
  const [genre, setGenre] = useState('All');

  const allGenres = ['All', ...Array.from(new Set(albums.flatMap(a => a.genres)))];
  let list = [...albums];
  if (genre !== 'All') list = list.filter(a => a.genres.includes(genre));
  if (sort === 'year') list.sort((a, b) => b.year - a.year);
  if (sort === 'artist') list.sort((a, b) => a.artist.localeCompare(b.artist));
  if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="page page--browse">
      <header className="browse__head">
        <div>
          <div className="browse__kicker">SECTION 02 · CATALOGUE</div>
          <h1 className="browse__title">Albums</h1>
          <div className="browse__sub">{list.length} of {albums.length} records · vinyl-led personal archive</div>
        </div>
        <div className="browse__counts">
          <div><b>{albums.length}</b><span>RECORDS</span></div>
          <div><b>{new Set(albums.map(a => a.artist)).size}</b><span>ARTISTS</span></div>
          <div><b>{new Set(albums.flatMap(a => a.genres)).size}</b><span>GENRES</span></div>
        </div>
      </header>

      <div className="filters">
        <div className="filters__group">
          <span className="filters__label">SORT</span>
          <div className="seg seg--inline">
            {['added','year','artist','title'].map(v => (
              <button key={v} className={sort === v ? 'is-on' : ''} onClick={() => setSort(v)}>{v}</button>
            ))}
          </div>
        </div>
        <div className="filters__group">
          <span className="filters__label">VIEW</span>
          <div className="seg seg--inline">
            {['grid','list'].map(v => (
              <button key={v} className={view === v ? 'is-on' : ''} onClick={() => setView(v)}>{v}</button>
            ))}
          </div>
        </div>
        <div className="filters__group filters__group--scroll">
          <span className="filters__label">GENRE</span>
          <div className="chip-row chip-row--scroll">
            {allGenres.map(g => (
              <button key={g} className={`chip chip--btn ${g === genre ? 'is-on' : ''}`} onClick={() => setGenre(g)}>{g}</button>
            ))}
          </div>
        </div>
      </div>

      {view === 'grid' ? (
        <div className="browse__grid">
          {list.map((a, i) => (
            <Link key={a.id} to={`/album/${a.id}`} className="tile">
              <div className="tile__cover" style={tweaks.showCoverColor ? { '--shadow': a.dom } : undefined}>
                <img src={a.cover} alt="" draggable="false" />
                <div className="tile__hover">
                  <span className="tile__hover-row"><em>FORMAT</em><b>{a.format}</b></span>
                  <span className="tile__hover-row"><em>TRACKS</em><b>{String(a.tracks).padStart(2,'0')}</b></span>
                  <span className="tile__hover-row"><em>YEAR</em><b>{a.year}</b></span>
                </div>
                <span className="tile__cat">{String(i + 1).padStart(3,'0')}</span>
              </div>
              <div className="tile__meta">
                <h3 className="tile__title">{a.title}</h3>
                <div className="tile__sub"><span>{a.artist}</span><span className="tile__year">{a.year}</span></div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="catalog catalog--full">
          <div className="catalog__head">
            <span>#</span><span>TITLE</span><span>ARTIST</span><span>YEAR</span><span>FORMAT</span><span>GENRE</span><span className="catalog__r">ADDED</span>
          </div>
          {list.map((a, i) => (
            <Link key={a.id} to={`/album/${a.id}`} className="catalog__row">
              <span className="catalog__n">{String(i + 1).padStart(3,'0')}</span>
              <span className="catalog__t"><span className="catalog__sw" style={{ background: a.dom }} />{a.title}</span>
              <span className="catalog__a">{a.artist}</span>
              <span>{a.year}</span>
              <span>{a.format}</span>
              <span>{a.genres[0]}</span>
              <span className="catalog__r catalog__d">{a.added}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

// ===========================================================
// Artists browse
// ===========================================================
window.ArtistsBrowse = function ArtistsBrowse({ tweaks }) {
  const { artists } = window.RUSS_DATA;
  const [letter, setLetter] = useState('All');
  const letters = ['All', ...Array.from(new Set(artists.map(a => a.name[0].toUpperCase()))).sort()];
  const list = letter === 'All' ? artists : artists.filter(a => a.name[0].toUpperCase() === letter);

  return (
    <div className="page page--browse">
      <header className="browse__head">
        <div>
          <div className="browse__kicker">SECTION 03 · ROSTER</div>
          <h1 className="browse__title">Artists</h1>
          <div className="browse__sub">{list.length} of {artists.length} acts in the collection</div>
        </div>
        <div className="browse__counts">
          <div><b>{artists.length}</b><span>ARTISTS</span></div>
          <div><b>{new Set(artists.map(a => a.country)).size}</b><span>COUNTRIES</span></div>
          <div><b>{artists.reduce((s, a) => s + a.albums, 0)}</b><span>RELEASES</span></div>
        </div>
      </header>

      <div className="filters">
        <div className="filters__group filters__group--scroll">
          <span className="filters__label">A–Z</span>
          <div className="chip-row chip-row--scroll">
            {letters.map(l => (
              <button key={l} className={`chip chip--btn chip--mono ${l === letter ? 'is-on' : ''}`} onClick={() => setLetter(l)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="browse__agrid">
        {list.map((a, i) => (
          <Link key={a.id} to={`/artist/${a.name.replace(/\s+/g,'-').toLowerCase()}`} className="atile atile--lg">
            <div className="atile__photo" style={tweaks.showCoverColor ? { '--shadow': a.dom } : undefined}>
              <img src={a.photo} alt="" draggable="false" />
            </div>
            <div className="atile__meta">
              <span className="atile__num">{String(i + 1).padStart(2,'0')}</span>
              <div>
                <h3 className="atile__name">{a.name}</h3>
                <div className="atile__sub">{a.albums} releases · {a.country}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};
