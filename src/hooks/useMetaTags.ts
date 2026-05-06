import { useEffect } from 'react';

export interface MetaTags {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
  canonical?: string;
  jsonLd?: object | object[];
}

const JSONLD_MARKER = 'data-russfm-jsonld';

function upsertMeta(selector: string, attrs: Record<string, string>, created: Element[]) {
  let el = document.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    for (const [key, value] of Object.entries(attrs)) {
      if (key !== 'content') el.setAttribute(key, value);
    }
    document.head.appendChild(el);
    created.push(el);
  }
  if (attrs.content !== undefined) el.setAttribute('content', attrs.content);
}

export function useMetaTags(tags: MetaTags) {
  const jsonLdSerialized = tags.jsonLd ? JSON.stringify(tags.jsonLd) : undefined;

  useEffect(() => {
    const created: Element[] = [];

    if (tags.title) {
      document.title = tags.title;
      upsertMeta('meta[property="og:title"]', { property: 'og:title', content: tags.title }, created);
      upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: tags.title }, created);
    }

    if (tags.description) {
      upsertMeta('meta[name="description"]', { name: 'description', content: tags.description }, created);
      upsertMeta('meta[property="og:description"]', { property: 'og:description', content: tags.description }, created);
      upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: tags.description }, created);
    }

    if (tags.image) {
      upsertMeta('meta[property="og:image"]', { property: 'og:image', content: tags.image }, created);
      upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: tags.image }, created);
      upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' }, created);
    }

    if (tags.url) {
      upsertMeta('meta[property="og:url"]', { property: 'og:url', content: tags.url }, created);
      upsertMeta('meta[name="twitter:url"]', { name: 'twitter:url', content: tags.url }, created);
    }

    if (tags.type) {
      upsertMeta('meta[property="og:type"]', { property: 'og:type', content: tags.type }, created);
    }

    if (tags.canonical) {
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
        created.push(link);
      }
      link.setAttribute('href', tags.canonical);
    }

    if (tags.jsonLd) {
      const blocks = Array.isArray(tags.jsonLd) ? tags.jsonLd : [tags.jsonLd];
      const existing = Array.from(
        document.querySelectorAll(`script[${JSONLD_MARKER}]`),
      ) as HTMLScriptElement[];
      blocks.forEach((block, idx) => {
        let script = existing[idx];
        if (!script) {
          script = document.createElement('script');
          script.setAttribute('type', 'application/ld+json');
          script.setAttribute(JSONLD_MARKER, '');
          document.head.appendChild(script);
          created.push(script);
        }
        script.textContent = JSON.stringify(block);
      });
      for (let i = blocks.length; i < existing.length; i += 1) {
        existing[i].remove();
      }
    }

    return () => {
      created.forEach((el) => el.remove());
    };
  }, [tags.title, tags.description, tags.image, tags.url, tags.type, tags.canonical, jsonLdSerialized]);
}
