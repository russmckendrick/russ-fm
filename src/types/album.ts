/** Link from a boxset member up to its parent boxset release. */
export interface BoxsetLink {
  parent_discogs_id: string;
  name: string | null;
  uri_release: string | null;
}

/** Summary of a member album listed in a boxset's `boxset_contents`. */
export interface BoxsetContent {
  release_name: string;
  uri_release: string;
  images_uri_release: {
    'hi-res': string;
    medium: string;
  };
}

export interface Album {
  release_name: string;
  release_artist: string;
  artists: Array<{
    name: string;
    uri_artist: string;
    json_detailed_artist?: string;
    images_uri_artist?: {
      'hi-res': string;
      medium: string;
      avatar: string;
    };
    biography?: string;
  }>;
  genre_names: string[];
  styles?: string[];
  formats?: string[];
  format_primary?: string | null;
  labels?: string[];
  country?: string | null;
  lastfm_listeners?: number | null;
  uri_release: string;
  uri_artist: string;
  date_added: string;
  date_release_year: string;
  json_detailed_release?: string;
  json_detailed_artist?: string;
  images_uri_release: {
    'hi-res': string;
    medium: string;
  };
  images_uri_artist?: {
    'hi-res': string;
    medium: string;
    avatar: string;
  };
  /** Present only on boxset members — excludes the album from stats/recent/browse aggregates. */
  boxset?: BoxsetLink | null;
  /** Present only on boxset parents that have linked members. */
  boxset_contents?: BoxsetContent[];
}

export interface Artist {
  name: string;
  uri: string;
  avatar: string;
  latestAlbum: Album;
}