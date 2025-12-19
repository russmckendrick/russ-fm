import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Disc, Users, Music, TrendingUp } from 'lucide-react';
import { useCountAnimation } from '@/hooks/useCountAnimation';
import { CollectionStats as CollectionStatsType } from '@/pages/StatsPage'; // We will export this type from StatsPage

interface CollectionStatsProps {
  stats: CollectionStatsType;
  loading: boolean;
}

export function CollectionStats({ stats, loading }: CollectionStatsProps) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  const animatedTotalAlbums = useCountAnimation(stats.totalAlbums || 0, 2000, !loading && inView);
  const animatedUniqueArtists = useCountAnimation(stats.uniqueArtists || 0, 2000, !loading && inView);
  const animatedUniqueGenres = useCountAnimation(stats.uniqueGenres || 0, 2000, !loading && inView);

  const overviewCards = [
    {
      title: 'Total Albums',
      value: animatedTotalAlbums,
      icon: Disc,
      color: 'text-blue-500',
      gradient: 'from-blue-500/10 to-blue-500/5',
      border: 'border-blue-500/20',
      delay: 0
    },
    {
      title: 'Unique Artists',
      value: animatedUniqueArtists,
      icon: Users,
      color: 'text-green-500',
      gradient: 'from-green-500/10 to-green-500/5',
      border: 'border-green-500/20',
      delay: 0.1
    },
    {
      title: 'Unique Genres',
      value: animatedUniqueGenres,
      icon: Music,
      color: 'text-amber-500',
      gradient: 'from-amber-500/10 to-amber-500/5',
      border: 'border-amber-500/20',
      delay: 0.2
    },
    {
      title: 'Avg Albums/Artist',
      value: stats.avgAlbumsPerArtist,
      icon: TrendingUp,
      color: 'text-purple-500',
      gradient: 'from-purple-500/10 to-purple-500/5',
      border: 'border-purple-500/20',
      delay: 0.3
    },
  ];

  return (
    <div ref={ref} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {overviewCards.map((card) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ delay: card.delay, duration: 0.5 }}
        >
          <motion.div
            whileHover={{ scale: 1.02, y: -5 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="h-full"
          >
            <Card className={`h-full backdrop-blur-md bg-card/40 hover:bg-card/60 border-white/10 shadow-lg hover:shadow-xl transition-all overflow-hidden relative group`}>
              {/* Subtle Gradient Background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  {card.title}
                </CardTitle>
                <div className={`p-2 rounded-full bg-background/50 ${card.color} ring-1 ring-white/10`}>
                  <card.icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-3xl font-bold tracking-tight">
                  {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
}