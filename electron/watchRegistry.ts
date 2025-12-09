// electron/watchRegistry.ts
import { BrowserWindow } from "electron";
import chokidar, { FSWatcher } from "chokidar";
import path from "node:path";

export type Domain = "mods" | "modPlay" | "backup";
export type VaultPaths = { mods?: string; modPlay?: string; backup?: string };

export type EventType = "added" | "removed" | "changed" | "renamed" | "refresh";

export interface WatchEvent {
  domain: Domain;
  type: EventType;
  file: string;
  at: number;
}

const FLUSH_INTERVAL_MS = 250;
const FLUSH_MAX_BATCH = 25;
// Soft cap on main-process event queue; drop oldest if we go past this
const MAX_QUEUE_LENGTH = 1000;

const DEFAULT_IGNORES =
  /(^|[/\\])(\.DS_Store|Thumbs\.db|desktop\.ini|\.git|node_modules|\.idea|\.vscode)$/i;

class WatchRegistry {
  private watchers: Partial<Record<Domain, FSWatcher & { _nkRoot?: string }>> = {};
  private paths: VaultPaths = {};
  private windows = new Set<BrowserWindow>();
  private eventQueue: WatchEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private pendingPaths: VaultPaths | null = null;

  /**
   * Attach a BrowserWindow to receive watcher events.
   * Safe to call multiple times; no duplicate "closed" listeners.
   */
  attach(win: BrowserWindow) {
    if (this.windows.has(win)) {
      console.log("[watchRegistry] attach: window already attached (id=%s)", win.id);
      return;
    }

    console.log("[watchRegistry] attach: registering window (id=%s)", win.id);
    this.windows.add(win);

    win.once("closed", () => {
      console.log("[watchRegistry] window closed; removing (id=%s)", win.id);
      this.windows.delete(win);
    });

    // If setPaths was called before window attached, apply those paths now
    if (this.pendingPaths) {
      console.log("[watchRegistry] attach: applying pending paths", this.pendingPaths);
      const pending = this.pendingPaths;
      this.pendingPaths = null;
      this.setPaths(pending);
    }
  }

  /**
   * Set watcher root paths for each domain.
   * Only rebuilds when actual values change.
   * If no windows are attached yet, stores paths to apply later.
   */
  setPaths(next: VaultPaths) {
    const changed =
      next.mods !== this.paths.mods ||
      next.modPlay !== this.paths.modPlay ||
      next.backup !== this.paths.backup;

    this.paths = { ...this.paths, ...next };

    // If no windows attached yet, defer the rebuild
    if (this.windows.size === 0) {
      console.log("[watchRegistry] setPaths: no windows attached yet, storing as pending");
      this.pendingPaths = { ...this.paths };
      return;
    }

    if (changed) {
      console.log("[watchRegistry] paths changed, calling rebuild()", {
        prev: this.paths,
        next,
      });
      this.rebuild();
    } else {
      console.log("[watchRegistry] setPaths called with unchanged paths; no rebuild");
    }
  }

  /**
   * Enable watching for a single domain (idempotent).
   * Defers if no windows attached - watchers will be built when paths are applied.
   */
  async enable(domain: Domain) {
    console.log("[watchRegistry] enable domain:", domain);
    
    // If no windows, do nothing - rebuild() will handle it when paths applied
    if (this.windows.size === 0) {
      console.log("[watchRegistry] enable: no windows attached, will be handled by rebuild");
      return;
    }
    
    await this.buildOne(domain);
  }

  /**
   * Disable watching for a single domain.
   */
  async disable(domain: Domain) {
    console.log("[watchRegistry] disable domain:", domain);
    const w = this.watchers[domain];
    if (w) {
      try {
        await w.close();
      } catch (e) {
        console.warn("[watchRegistry] error closing watcher for domain", domain, e);
      }
      delete this.watchers[domain];
    }
  }

  /**
   * Dispose all watchers.
   */
  async disposeAll() {
    console.log("[watchRegistry] disposeAll called");
    const watchers = Object.entries(this.watchers);
    this.watchers = {};

    await Promise.all(
      watchers.map(async ([domain, watcher]) => {
        if (!watcher) return;
        try {
          console.log("[watchRegistry] closing watcher for domain:", domain);
          await watcher.close();
        } catch (e) {
          console.warn(
            "[watchRegistry] error closing watcher during disposeAll for domain",
            domain,
            e
          );
        }
      })
    );
  }

  /**
   * Force a full rebuild of all domains (mods, modPlay, backup).
   */
  async refreshAll() {
    console.log("[watchRegistry] refreshAll called – rebuilding all watchers");
    await this.rebuild();
  }

  /**
   * Debug helper: Get current watcher state.
   */
  public getWatcherState(): {
    active: Domain[];
    paths: VaultPaths;
    windowCount: number;
    queueLength: number;
  } {
    return {
      active: Object.keys(this.watchers) as Domain[],
      paths: { ...this.paths },
      windowCount: this.windows.size,
      queueLength: this.eventQueue.length,
    };
  }

  // ---- internal helpers ----

  private queueEvent(evt: WatchEvent) {
    // Soft bound the queue; drop oldest events if we get too backed up
    if (this.eventQueue.length >= MAX_QUEUE_LENGTH) {
      const drop = Math.ceil(this.eventQueue.length / 4); // drop 25%
      this.eventQueue.splice(0, drop);
      console.warn(
        "[watchRegistry] eventQueue reached MAX_QUEUE_LENGTH; dropped",
        drop,
        "oldest events"
      );
    }

    this.eventQueue.push(evt);

    if (this.eventQueue.length >= FLUSH_MAX_BATCH) {
      this.flushQueue();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flushQueue(), FLUSH_INTERVAL_MS);
    }
  }

  private flushQueue() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.eventQueue.length === 0) return;

    const batch = this.eventQueue.splice(0);
    for (const evt of batch) {
      this.broadcast(evt);
    }
  }

  private async rebuild() {
    console.log("[watchRegistry] rebuild() - disposing and recreating watchers");

    await this.disposeAll();

    const domains: Domain[] = ["mods", "modPlay", "backup"];
    await Promise.all(domains.map((d) => this.buildOne(d)));

    // Soft refresh events for all domains so UI can resync
    const now = Date.now();
    for (const d of domains) {
      this.broadcast({ domain: d, type: "refresh", file: "", at: now });
    }
  }

  private resolveRoot(domain: Domain): string | undefined {
    const mapping: Record<Domain, keyof VaultPaths> = {
      mods: "mods",
      modPlay: "modPlay",
      backup: "backup",
    };

    const key = mapping[domain];
    return this.paths[key];
  }

  private async buildOne(domain: Domain) {
    const root = this.resolveRoot(domain);
    if (!root) {
      console.log(
        "[watchRegistry] buildOne: no root for domain %s; disabling watcher",
        domain
      );
      await this.disable(domain);
      return;
    }

    // If watcher exists on same root, keep it
    const existing = this.watchers[domain];
    if (existing && (existing as any)._nkRoot === root) {
      console.log(
        "[watchRegistry] buildOne: watcher already active on root for domain %s",
        domain
      );
      return;
    }

    // Replace any existing watcher
    await this.disable(domain);

    console.log("[watchRegistry] buildOne: creating watcher for domain %s at root %s", domain, root);

    const watcher = chokidar.watch(root, {
      ignoreInitial: true,
      persistent: true,
      depth: 99, // deep-watch by default
      ignored: (p: string) => DEFAULT_IGNORES.test(p),
      awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
    }) as FSWatcher & { _nkRoot?: string };

    watcher._nkRoot = root;

    const send = (type: EventType, file: string) => {
      const norm = file.split(path.sep).join("/");
      this.queueEvent({
        domain,
        type,
        file: norm,
        at: Date.now(),
      });
    };

    watcher
      .on("add", (f) => send("added", f))
      .on("addDir", (f) => send("added", f))
      .on("change", (f) => send("changed", f))
      .on("unlink", (f) => send("removed", f))
      .on("unlinkDir", (f) => send("removed", f))
      .on("error", (error) => {
        console.error(
          `[watchRegistry] watcher error on domain ${domain}:`,
          error
        );
        // force a soft refresh on errors
        this.broadcast({ domain, type: "refresh", file: "", at: Date.now() });
      });

    this.watchers[domain] = watcher;
  }

  private broadcast(evt: WatchEvent) {
    const windowsCount = this.windows.size;
    console.log("[watchRegistry] broadcast", evt, "to", windowsCount, "window(s)");

    for (const win of this.windows) {
      if (win.isDestroyed()) continue;
      try {
        win.webContents.send("watchers:event", evt);
      } catch (e) {
        console.warn(
          "[watchRegistry] failed to send watchers:event to window id",
          win.id,
          e
        );
      }
    }
  }
}

export const watchRegistry = new WatchRegistry();