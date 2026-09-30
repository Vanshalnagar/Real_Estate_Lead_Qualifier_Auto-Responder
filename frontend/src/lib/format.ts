export function inr(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 10000000) return `₹${+(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${+(n / 100000).toFixed(1)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

export function dateLong(d: string | Date): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function dateTime(d: string | Date): string {
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

export function timeAgo(d: string | Date): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const CHANNEL_LABEL: Record<string, string> = {
  web_chat: 'Website Chat',
  web_form: 'Website Form',
  google_form: 'Google Form',
  whatsapp: 'WhatsApp',
};

export const INTENT_LABEL: Record<string, string> = { buyer: 'Buyer', renter: 'Renter', investor: 'Investor', unclear: 'Unclear' };

export const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  auto_responded: 'Auto-responded',
  needs_broker: 'Needs broker',
  contacted: 'Contacted',
  qualified: 'Qualified',
  closed_won: 'Closed — won',
  closed_lost: 'Closed — lost',
};

export const TYPE_LABEL: Record<string, string> = { apartment: 'Apartment', villa: 'Villa / House', plot: 'Plot', commercial: 'Commercial', other: 'Other' };
