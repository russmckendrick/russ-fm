/**
 * Release credits (Discogs `extraartists`) sorted into the kinds of link
 * /explore draws. Roles that tie a record to a pressing plant or a mastering
 * house rather than to the music (Mastered By, Lacquer Cut By, Manufactured
 * By…) are left out: they link everything to everything.
 */

export type CreditKind = 'produced' | 'played' | 'wrote' | 'engineered' | 'designed';

const SKIP = /master|lacquer|cut by|manufactur|distribut|market|copyright|phonographic|licens|pressed|printed|glass|legal|management|a&r|liner notes|translated|coordinat|executive|admin|booking|publish|other|art direction by|lettering|typography|layout|label|compiled|edited by|research|notes|transferred|restor|remaster|authoring|sequenced/i;

const RULES: [RegExp, CreditKind][] = [
  [/produc|mixed|remix/i, 'produced'],
  [/engineer|recorded|programm/i, 'engineered'],
  [/written|composed|lyrics|songwriter|music by|words by|arranged|orchestrat|conductor/i, 'wrote'],
  [/design|artwork|photograph|painting|illustrat|cover|sleeve/i, 'designed'],
  [/guitar|bass|drum|percussion|keyboard|synth|piano|organ|vocal|voice|sax|trumpet|trombone|horn|violin|viola|cello|strings|harmonica|flute|clarinet|oboe|harp|banjo|mandolin|accordion|sitar|electronics|choir|chorus|performer|featuring|backing|tabla|vibraphone|marimba|glockenspiel|harmonium|mellotron|theremin|lap steel|pedal steel|dobro|ukulele|fiddle|turntables|scratches|rap|beatbox|whistl|bells|tambourine|congas|bongos|timpani|sampler|loops|instruments|musician|soloist|tuba|bassoon|celesta|melodica|clavinet|moog|bouzouki|bagpipes|didgeridoo|kalimba|steel drums|handclaps|claps/i, 'played'],
];

/** The kind of link a Discogs role makes, or null for roles /explore ignores. */
export function creditKind(role: string): CreditKind | null {
  if (!role || SKIP.test(role)) return null;
  for (const [re, kind] of RULES) if (re.test(role)) return kind;
  return null;
}

/** "produced", "played on", "wrote for": the verb before a record title. */
export function creditVerb(kind: CreditKind, role: string): string {
  switch (kind) {
    case 'produced':
      return /remix/i.test(role) ? 'remixed' : /mix/i.test(role) && !/produc/i.test(role) ? 'mixed' : 'produced';
    case 'engineered':
      return /recorded/i.test(role) ? 'recorded' : 'engineered';
    case 'wrote':
      return /arrang|orchestrat/i.test(role) ? 'arranged' : /conduct/i.test(role) ? 'conducted' : 'wrote on';
    case 'designed':
      return /photograph/i.test(role) ? 'photographed' : 'designed the sleeve of';
    case 'played': {
      if (/vocal|voice|choir|chorus|backing/i.test(role)) return 'sang on';
      const instrument = role.replace(/\s*by$/i, '').trim().toLowerCase();
      return instrument && instrument.length < 24 && !/performer|musician|featuring/.test(instrument) ? `played ${instrument} on` : 'played on';
    }
  }
}
