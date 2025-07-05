import { Card, CardContent } from '@/components/ui/card';
import { Music, Users, Tag } from 'lucide-react';

interface CollectionStatsProps {
  totalAlbums: number;
  totalArtists: number;
  totalGenres: number;
}

export function CollectionStats({ totalAlbums, totalArtists, totalGenres }: CollectionStatsProps) {
  const stats = [
    {
      icon: Music,
      label: 'Albums',
      value: totalAlbums,
      color: 'text-blue-600'
    },
    {
      icon: Users,
      label: 'Artists',
      value: totalArtists,
      color: 'text-green-600'
    },
    {
      icon: Tag,
      label: 'Genres',
      value: totalGenres,
      color: 'text-purple-600'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {stats.map((stat) => {
        const IconComponent = stat.icon;
        return (
          <Card key={stat.label} className="transition-all duration-300 hover:scale-105">
            <CardContent className="p-6 text-center">
              <IconComponent className={`h-8 w-8 mx-auto mb-2 ${stat.color}`} />
              <div className={`text-3xl font-bold mb-1 ${stat.color}`}>
                {stat.value.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground uppercase tracking-wide">
                {stat.label}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}