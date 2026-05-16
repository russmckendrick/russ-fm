import { Link } from 'react-router-dom';
import { BrowseHeader } from '@/components/browse/BrowseHeader';
import { PageContainer } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { appConfig } from '@/config/app.config';

interface BrowseTile {
  to: string;
  num: string;
  label: string;
  blurb: string;
}

const TILES: BrowseTile[] = [
  {
    to: '/genres',
    num: '01',
    label: 'Genres',
    blurb: 'A ranked atlas of every genre and style, with dossiers and a living network map.',
  },
  {
    to: '/labels',
    num: '02',
    label: 'Labels',
    blurb: 'Every imprint represented on the shelves, ranked by release count.',
  },
  {
    to: '/decades',
    num: '03',
    label: 'Decades',
    blurb: 'Slice the catalogue by the decade each record was first released.',
  },
  {
    to: '/countries',
    num: '04',
    label: 'Countries',
    blurb: 'Where each pressing came from, by Discogs release country.',
  },
];

export function BrowseIndexPage() {
  usePageTitle('Browse the catalogue | Russ.fm');
  useMetaTags({
    title: 'Browse the catalogue | Russ.fm',
    description: 'Slice the collection by genre, label, decade, or country of origin.',
    image: `${appConfig.siteUrl}/og-image.png`,
    url: `${appConfig.siteUrl}/browse`,
    type: 'website',
  });

  return (
    <PageContainer>
      <BrowseHeader
        num="00"
        kicker="Browse · russ.fm / catalogue"
        title="Slice the catalogue"
        subtitle="Pick the dimension that matters today — genres for the atlas and network view, labels for the wax-nerd view, decades for the time-capsule view, countries for the geography of pressings."
      />

      <ul className="grid gap-[1px] border border-rule-strong bg-rule-strong md:grid-cols-2">
        {TILES.map((tile) => (
          <li key={tile.to}>
            <Link
              to={tile.to}
              className="group flex h-full flex-col gap-3 bg-paper px-6 py-7 transition-colors hover:bg-paper-2"
            >
              <div className="flex items-baseline gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
                <span className="text-hl">{tile.num}</span>
                <span>{tile.label}</span>
              </div>
              <h2 className="font-display text-[clamp(28px,3.5vw,40px)] uppercase leading-none tracking-[-0.01em] text-ink group-hover:text-hl">
                {tile.label}
              </h2>
              <p className="max-w-prose font-grot text-[14px] leading-snug text-ink-2">
                {tile.blurb}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
