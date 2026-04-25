import { cn } from "@/lib/utils";
import { DossierHero } from "@/components/layout/EditorialPrimitives";

interface BrowseHeaderProps {
  num: string;
  kicker: string;
  title: string;
  subtitle?: string;
  counts?: Array<{ label: string; value: string | number }>;
  className?: string;
}

/**
 * Editorial header for browse pages. Mirrors the `SectionHeader` idiom
 * but scaled up for full-page use: kicker row → display title →
 * optional subtitle → optional mono count strip. Single hairline rule
 * closes it off.
 */
export function BrowseHeader({
  num,
  kicker,
  title,
  subtitle,
  counts,
  className,
}: BrowseHeaderProps) {
  return (
    <DossierHero
      num={num}
      kicker={kicker}
      title={title}
      subtitle={subtitle}
      counts={counts}
      titleClassName="max-w-[min(100%,18ch)] lg:max-w-[min(100%,24ch)]"
      className={cn("mb-8 md:mb-10", className)}
    />
  );
}
