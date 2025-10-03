import { useEffect } from 'react';

export interface MetaTags {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
}

export function useMetaTags(tags: MetaTags) {
  useEffect(() => {
    const metaElements: HTMLMetaElement[] = [];

    // Set title
    if (tags.title) {
      document.title = tags.title;

      // OG title
      let ogTitle = document.querySelector('meta[property="og:title"]') as HTMLMetaElement;
      if (!ogTitle) {
        ogTitle = document.createElement('meta');
        ogTitle.setAttribute('property', 'og:title');
        document.head.appendChild(ogTitle);
        metaElements.push(ogTitle);
      }
      ogTitle.setAttribute('content', tags.title);

      // Twitter title
      let twitterTitle = document.querySelector('meta[name="twitter:title"]') as HTMLMetaElement;
      if (!twitterTitle) {
        twitterTitle = document.createElement('meta');
        twitterTitle.setAttribute('name', 'twitter:title');
        document.head.appendChild(twitterTitle);
        metaElements.push(twitterTitle);
      }
      twitterTitle.setAttribute('content', tags.title);
    }

    // Set description
    if (tags.description) {
      let description = document.querySelector('meta[name="description"]') as HTMLMetaElement;
      if (!description) {
        description = document.createElement('meta');
        description.setAttribute('name', 'description');
        document.head.appendChild(description);
        metaElements.push(description);
      }
      description.setAttribute('content', tags.description);

      // OG description
      let ogDescription = document.querySelector('meta[property="og:description"]') as HTMLMetaElement;
      if (!ogDescription) {
        ogDescription = document.createElement('meta');
        ogDescription.setAttribute('property', 'og:description');
        document.head.appendChild(ogDescription);
        metaElements.push(ogDescription);
      }
      ogDescription.setAttribute('content', tags.description);

      // Twitter description
      let twitterDescription = document.querySelector('meta[name="twitter:description"]') as HTMLMetaElement;
      if (!twitterDescription) {
        twitterDescription = document.createElement('meta');
        twitterDescription.setAttribute('name', 'twitter:description');
        document.head.appendChild(twitterDescription);
        metaElements.push(twitterDescription);
      }
      twitterDescription.setAttribute('content', tags.description);
    }

    // Set image
    if (tags.image) {
      // OG image
      let ogImage = document.querySelector('meta[property="og:image"]') as HTMLMetaElement;
      if (!ogImage) {
        ogImage = document.createElement('meta');
        ogImage.setAttribute('property', 'og:image');
        document.head.appendChild(ogImage);
        metaElements.push(ogImage);
      }
      ogImage.setAttribute('content', tags.image);

      // Twitter image
      let twitterImage = document.querySelector('meta[name="twitter:image"]') as HTMLMetaElement;
      if (!twitterImage) {
        twitterImage = document.createElement('meta');
        twitterImage.setAttribute('name', 'twitter:image');
        document.head.appendChild(twitterImage);
        metaElements.push(twitterImage);
      }
      twitterImage.setAttribute('content', tags.image);

      // Twitter card type
      let twitterCard = document.querySelector('meta[name="twitter:card"]') as HTMLMetaElement;
      if (!twitterCard) {
        twitterCard = document.createElement('meta');
        twitterCard.setAttribute('name', 'twitter:card');
        document.head.appendChild(twitterCard);
        metaElements.push(twitterCard);
      }
      twitterCard.setAttribute('content', 'summary_large_image');
    }

    // Set URL
    if (tags.url) {
      let ogUrl = document.querySelector('meta[property="og:url"]') as HTMLMetaElement;
      if (!ogUrl) {
        ogUrl = document.createElement('meta');
        ogUrl.setAttribute('property', 'og:url');
        document.head.appendChild(ogUrl);
        metaElements.push(ogUrl);
      }
      ogUrl.setAttribute('content', tags.url);
    }

    // Set type
    if (tags.type) {
      let ogType = document.querySelector('meta[property="og:type"]') as HTMLMetaElement;
      if (!ogType) {
        ogType = document.createElement('meta');
        ogType.setAttribute('property', 'og:type');
        document.head.appendChild(ogType);
        metaElements.push(ogType);
      }
      ogType.setAttribute('content', tags.type);
    }

    // Cleanup function to remove added meta tags
    return () => {
      metaElements.forEach(el => el.remove());
    };
  }, [tags.title, tags.description, tags.image, tags.url, tags.type]);
}
