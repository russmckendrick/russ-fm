/** Site paths for the Wrapped pages, whose data carries slugs rather than `uri_release`. */

export function releaseUri(slug: string): string {
  return `/album/${slug}/`;
}

export function artistUri(slug: string): string {
  return `/artist/${slug}/`;
}
