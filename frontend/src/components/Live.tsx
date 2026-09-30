import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { timeAgo } from '../lib/format';
import type { SyncInfo } from '../lib/types';

const FALLBACK = '/images/site/listing-fallback.svg';

/**
 * Image hosted by the source portal. Sent without a referrer; if the portal has removed the
 * photo, a neutral placeholder is shown instead of a broken image.
 */
export function LiveImage({ src, alt, ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  const [url, setUrl] = useState(src || FALLBACK);
  useEffect(() => setUrl(src || FALLBACK), [src]);
  return <img {...rest} src={url} alt={alt} referrerPolicy="no-referrer" onError={() => url !== FALLBACK && setUrl(FALLBACK)} />;
}

/** "Live from MagicBricks via Apify · updated 8 min ago". */
export function SyncBadge({ sync }: { sync: SyncInfo | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  if (!sync) return null;
  const fresh = sync.lastSuccessfulSyncAt && Date.now() - new Date(sync.lastSuccessfulSyncAt).getTime() < 26 * 60 * 60 * 1000;
  return (
    <p className={`sync-badge ${fresh ? '' : 'sync-badge--stale'}`} aria-live="polite">
      <span className="sync-badge__dot" />
      Live listings from <strong>{sync.source}</strong>
      {sync.lastSuccessfulSyncAt ? <> · updated {timeAgo(sync.lastSuccessfulSyncAt)}</> : <> · first sync in progress</>}
      {sync.syncing && <> · refreshing…</>}
    </p>
  );
}

export function sourceName(url?: string | null): string {
  if (!url) return 'source';
  if (url.includes('magicbricks.com')) return 'MagicBricks';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}
