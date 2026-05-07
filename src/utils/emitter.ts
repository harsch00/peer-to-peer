/**
 * Tiny event emitter — avoids depending on node's `events` module, which is
 * not polyfilled by Metro in RN 0.74+.
 */
export class TinyEmitter {
  private listeners = new Map<string, Set<(...args: any[]) => void>>();

  on(event: string, cb: (...args: any[]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
    return () => this.off(event, cb);
  }

  off(event: string, cb: (...args: any[]) => void): void {
    this.listeners.get(event)?.delete(cb);
  }

  emit(event: string, ...args: any[]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        cb(...args);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`[emitter:${event}]`, e);
      }
    }
  }
}
