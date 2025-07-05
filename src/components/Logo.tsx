import { Music } from 'lucide-react';

interface LogoProps {
  className?: string;
}

export function Logo({ className = "" }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Music className="h-8 w-8 text-primary" />
      <span className="text-xl font-bold">Russ.fm</span>
    </div>
  );
}