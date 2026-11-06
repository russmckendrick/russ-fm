import { useQuery } from '@tanstack/react-query'
import { api, keys } from './api'

// Library data only changes when a job writes collection.json, and those jobs invalidate it.
const LONG = 5 * 60_000

export const useOverview = () => useQuery({ queryKey: keys.overview, queryFn: api.overview, staleTime: 30_000 })

export const useLibrary = () =>
  useQuery({ queryKey: keys.library, queryFn: api.library, staleTime: LONG, select: (d) => d.items })

export const useArtists = () =>
  useQuery({ queryKey: keys.artists, queryFn: api.artists, staleTime: LONG, select: (d) => d.artists })

export const useRelease = (slug: string) =>
  useQuery({ queryKey: keys.release(slug), queryFn: () => api.release(slug), staleTime: 30_000 })

export const useArtist = (slug: string) =>
  useQuery({ queryKey: keys.artist(slug), queryFn: () => api.artist(slug), staleTime: 30_000 })
