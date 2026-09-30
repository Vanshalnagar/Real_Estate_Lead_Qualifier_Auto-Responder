import { EventEmitter } from 'node:events';

/** In-process event bus feeding the admin panel's SSE stream. */
export const bus = new EventEmitter();
bus.setMaxListeners(100);

export type AdminEvent =
  | { type: 'lead.created'; leadId: string; urgency: string; channel: string }
  | { type: 'lead.updated'; leadId: string; urgency: string; channel: string }
  | { type: 'message'; leadId: string; direction: string }
  | { type: 'broker.alert'; leadId: string; urgency: string; channel: string; name: string | null; summary: string };

export function emitAdmin(e: AdminEvent): void {
  bus.emit('admin', e);
}
