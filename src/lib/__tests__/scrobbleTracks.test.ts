import { describe, it, expect } from 'vitest';
import { toScrobbleTracks } from '../scrobbleTracks';

describe('toScrobbleTracks', () => {
  it('carries per-track artists through for compilations', () => {
    expect(
      toScrobbleTracks([
        { name: 'Til I Hear It From You ', position: 'A1', artists: [{ name: 'Gin Blossoms' }] },
        { name: 'Liar ', position: 'A2', artists: [{ name: 'The Cranberries' }] },
      ])
    ).toEqual([
      { title: 'Til I Hear It From You', artist: 'Gin Blossoms' },
      { title: 'Liar', artist: 'The Cranberries' },
    ]);
  });

  it('drops position-less section headers', () => {
    // Discogs marks sides and box set albums with a position-less row; they are not songs.
    expect(
      toScrobbleTracks([
        { name: 'Side :/', position: '' },
        { name: 'Original Soundtrack', position: 'A1' },
        { name: 'Side ://' },
        { name: 'Cyberdelia', position: 'A2' },
      ]).map(t => t.title)
    ).toEqual(['Original Soundtrack', 'Cyberdelia']);
  });

  it('keeps every row when the tracklist has no positions at all', () => {
    // The Spotify and Last.fm fallbacks carry no positions — nothing there is a header.
    expect(
      toScrobbleTracks([{ name: 'Airbag' }, { name: 'Paranoid Android' }]).map(t => t.title)
    ).toEqual(['Airbag', 'Paranoid Android']);
  });

  it('drops untitled rows and leaves uncredited tracks for the worker to resolve', () => {
    expect(
      toScrobbleTracks([
        { name: '   ', position: 'A1' },
        { name: 'Prologue 1945', position: 'A2', artists: [] },
      ])
    ).toEqual([{ title: 'Prologue 1945', artist: undefined }]);
  });

  it('scrobbles a suite as its movements, each prefixed with the suite', () => {
    // Rush, 2112 (Discogs 38066922): side A is one suite in seven movements.
    expect(
      toScrobbleTracks([
        { name: '2112', position: '', type: 'index' },
        { name: 'Overture', position: 'A-I', parent: '2112' },
        { name: 'The Temples Of Syrinx', position: 'A-II', parent: '2112' },
        { name: 'A Passage To Bangkok', position: 'B1' },
      ]).map(t => t.title)
    ).toEqual(['2112: Overture', '2112: The Temples Of Syrinx', 'A Passage To Bangkok']);
  });

  it('keeps medley songs under their own titles and drops typed headings', () => {
    expect(
      toScrobbleTracks([
        { name: 'Side One', position: '', type: 'heading' },
        { name: 'Medley', position: '', type: 'index' },
        { name: '17 Days', position: 'A1.1', parent: 'Medley' },
      ]).map(t => t.title)
    ).toEqual(['17 Days']);
  });
});
