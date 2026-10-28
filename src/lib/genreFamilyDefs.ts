/**
 * The 12 genre families and the terms each one claims, with no imports, so
 * build scripts (scripts/generate-explore.ts) can read them too. The filing
 * rules and the disc are in genreFamilies.ts.
 */

export type GenreFamilyKey =
  | 'prog' | 'hard' | 'pop' | 'folk' | 'soul' | 'hiphop'
  | 'screen' | 'elec' | 'wave' | 'punk' | 'indie' | 'alt';

export interface GenreFamilyDef {
  key: GenreFamilyKey;
  code: string;
  name: string;
  terms: string[];
}

export const GENRE_FAMILIES: GenreFamilyDef[] = [
  { key: 'prog', code: 'A1', name: 'Prog & Psych', terms: ['Prog Rock', 'Art Rock', 'Psychedelic Rock', 'Space Rock', 'Krautrock', 'Symphonic Rock', 'Progressive Metal', 'Post Rock', 'Neo-Classical', 'Math Rock', 'Acid Rock'] },
  { key: 'hard', code: 'A2', name: 'Hard Rock & Metal', terms: ['Hard Rock', 'Heavy Metal', 'Thrash', 'Stoner Rock', 'Arena Rock', 'Glam', 'Classic Rock', 'Southern Rock', 'Blues Rock', 'Rock & Roll', 'Doom Metal', 'Speed Metal', 'Sludge Metal', 'Groove Metal', 'Pub Rock', 'Rockabilly', 'AOR'] },
  { key: 'pop', code: 'A3', name: 'Pop', terms: ['Pop Rock', 'Soft Rock', 'Ballad', 'Vocal', 'Europop', 'Beat', 'Chanson', 'Dance-pop', 'Alt-Pop', 'Schlager', 'Pop/Rock', 'Pop'] },
  { key: 'folk', code: 'A4', name: 'Folk & Country', terms: ['Folk Rock', 'Acoustic', 'Folk', 'Country', 'Country Rock', 'Americana', 'Celtic', 'Bluegrass', 'Singer/Songwriter', 'Folk, World, & Country'] },
  { key: 'soul', code: 'A5', name: 'Soul, Funk & Jazz', terms: ['Soul', 'Rhythm & Blues', 'Funk', 'Disco', 'Jazz-Funk', 'Acid Jazz', 'Neo Soul', 'Gospel', 'RnB/Swing', 'Northern Soul', 'P.Funk', 'Jazz-Rock', 'Fusion', 'Contemporary Jazz', 'Soul-Jazz', 'Hard Bop', 'Bop', 'Modal', 'Smooth Jazz', 'Swing', 'Electric Blues', 'Modern Electric Blues', 'Chicago Blues', 'Country Blues', 'Funk / Soul', 'Jazz', 'Blues', 'Latin'] },
  { key: 'hiphop', code: 'A6', name: 'Hip Hop & Reggae', terms: ['Conscious', 'Boom Bap', 'Gangsta', 'Pop Rap', 'Jazzy Hip-Hop', 'Turntablism', 'Reggae', 'Dub', 'Roots Reggae', 'Rocksteady', 'Dancehall', 'Hip Hop'] },
  { key: 'screen', code: 'B1', name: 'Stage & Screen', terms: ['Soundtrack', 'Score', 'Comedy', 'Musical', 'Theme', 'Spoken Word', 'Modern Classical', 'Contemporary', 'Stage & Screen', 'Classical', 'Non-Music'] },
  { key: 'elec', code: 'B2', name: 'Electronic', terms: ['Ambient', 'Leftfield', 'Downtempo', 'Techno', 'House', 'Breakbeat', 'Trip Hop', 'Abstract', 'Experimental', 'IDM', 'Big Beat', 'Acid House', 'Electronica', 'Drum n Bass', 'Trance', 'Dub Techno', 'Synthwave', 'Breaks', 'Musique Concrète', 'Drone', 'Berlin-School', 'Chillwave', 'Avantgarde', 'Electronic'] },
  { key: 'wave', code: 'B3', name: 'Synth & New Wave', terms: ['New Wave', 'Synth-pop', 'Electro', 'Post-Punk', 'Darkwave', 'Minimal', 'Coldwave', 'Italo-Disco', 'Hi NRG', 'EBM', 'Electroclash', 'Ethereal'] },
  { key: 'punk', code: 'B4', name: 'Punk & Ska', terms: ['Punk', 'Ska', 'Pop Punk', 'Hardcore', 'Oi', 'Emo', 'Garage Rock', 'Mod'] },
  { key: 'indie', code: 'B5', name: 'Indie & Britpop', terms: ['Indie Rock', 'Indie Pop', 'Britpop', 'Lo-Fi', 'Power Pop', 'Jangle Pop', 'Twee Pop', 'Madchester', 'Baggy'] },
  { key: 'alt', code: 'B6', name: 'Alternative', terms: ['Alternative Rock', 'Grunge', 'Shoegaze', 'Industrial', 'Funk Metal', 'Nu Metal', 'Alternative Metal', 'Noise', 'Goth Rock', 'Alternative'] },
];
