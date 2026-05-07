/**
 * Multiplex multiple transports as a single logical mesh fabric.
 */
import type {MeshTransport, PeerLink, TransportEvents, TransportId} from './types';

export interface ManagerEvents extends TransportEvents {
  /** Aggregated link list snapshot, fired whenever it changes. */
  onLinks: (links: PeerLink[]) => void;
}

export class TransportManager {
  private transports: MeshTransport[] = [];
  private events?: ManagerEvents;

  add(transport: MeshTransport) {
    this.transports.push(transport);
  }

  has(id: TransportId) {
    return this.transports.some(t => t.id === id);
  }

  async start(events: ManagerEvents) {
    this.events = events;
    const inner: TransportEvents = {
      onLinkUp: link => {
        events.onLinkUp(link);
        events.onLinks(this.allLinks());
      },
      onLinkDown: link => {
        events.onLinkDown(link);
        events.onLinks(this.allLinks());
      },
      onPacket: (linkId, bytes) => events.onPacket(linkId, bytes),
      onRssi: (linkId, rssi) => events.onRssi(linkId, rssi),
    };
    // Keep mesh startup resilient: one broken native transport should not
    // prevent the app from starting and registering its root component.
    await Promise.allSettled(this.transports.map(t => t.start(inner)));
    events.onLinks(this.allLinks());
  }

  async stop() {
    await Promise.all(this.transports.map(t => t.stop()));
  }

  allLinks(): PeerLink[] {
    return this.transports.flatMap(t => t.links());
  }

  async sendToLink(linkId: string, bytes: Uint8Array) {
    for (const t of this.transports) {
      if (t.links().some(l => l.linkId === linkId)) {
        await t.send(linkId, bytes);
        return;
      }
    }
  }

  async broadcast(bytes: Uint8Array, exceptLinkId?: string) {
    await Promise.all(this.transports.map(t => t.broadcast(bytes, exceptLinkId)));
  }

  list() {
    return this.transports.map(t => ({id: t.id, name: t.displayName}));
  }
}
