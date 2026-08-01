/** Tiny broadcast channel for transient user-facing notices (status bar). */
export class Notices {
  private readonly listeners = new Set<(message: string) => void>();
  /** Kept so a notice pushed before the UI mounts is not lost. */
  latest: string | null = null;

  push(message: string): void {
    this.latest = message;
    for (const listener of this.listeners) listener(message);
  }

  subscribe(listener: (message: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
