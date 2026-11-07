import { describe, it, expect } from 'vitest';
import { artistFacts } from '../artistFacts';

const goldie = {
  name: 'Goldie',
  followers: 119405,
  genres: ['Electronic', 'jungle', 'drum and bass', 'Drum n Bass', 'breakbeat', 'liquid funk'],
  raw_data: {
    discogs: { raw_data: { realname: 'Clifford Joseph Price', aliases: [{ name: 'Clifford Price' }] } },
    theaudiodb: { born_year: '1965', died_year: null, formed_year: '1991', country: 'Walsall, England, UK', genre: 'Drum & Bass', alternate_names: 'Rufige Kru' },
  },
};

describe('artistFacts', () => {
  it('prints a solo artist: real name, born, aliases, followers', () => {
    const { rows, genres } = artistFacts(goldie);
    expect(rows).toEqual([
      ['Real name', 'Clifford Joseph Price'],
      ['Born', '1965, Walsall, England'],
      ['Also known as', 'Rufige Kru, Clifford Price'],
      ['Followers', '119,405 on Spotify'],
    ]);
    expect(genres).toEqual(['Drum & Bass', 'Electronic', 'Jungle', 'Breakbeat']);
  });

  it('prints a band by when it formed, and skips a real name that is just the name', () => {
    const { rows } = artistFacts({
      name: 'Chvrches',
      raw_data: { discogs: { raw_data: { realname: 'CHVRCHES' } }, theaudiodb: { formed_year: '2011', country: 'Glasgow, Scotland' } },
    });
    expect(rows).toEqual([['Formed', '2011, Glasgow, Scotland']]);
  });

  it('reads a group TheAudioDB gives a "born" year as formed', () => {
    const { rows } = artistFacts({
      name: 'Jamiroquai',
      raw_data: { discogs: { raw_data: { members: [{}, {}] } }, theaudiodb: { born_year: '1992', formed_year: '1992', members: '9', country: 'London, England' } },
    });
    expect(rows).toEqual([['Formed', '1992, London, England']]);
  });

  it('copes with no data', () => {
    expect(artistFacts(null)).toEqual({ rows: [], genres: [] });
    expect(artistFacts({ name: 'Someone' })).toEqual({ rows: [], genres: [] });
  });
});
