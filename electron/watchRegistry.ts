// electron/watchRegistry.ts
import { BrowserWindow } from "electron";
import chokidar, { FSWatcher } from "chokidar";
import path from "node:path";

type Domain = "mods" | "modPlay" | "backup";
type VaultPaths = { mods?: string; modPlay?: string; backup?: string };

type EventType = "added" | "removed" | "changed" | "renamed" | "refresh";
type WatchEvent = { domain: Domain; type: EventType; file: string; at: number };

const DEFAULT_IGNORES =
  /(^|[/\\])(\.DS_Store|Thumbs\.db|desktop\.ini|\.git|node_modules|\.idea|\.vscode)$/i;

function debounce<T extends (...args: any[]) => void>(fn: T, ms = 300) {
  let t: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

class WatchRegistry {
  private watchers: Partial<Record<Domain, FSWatcher>> = {};
  private paths: VaultPaths = {};
  private windows = new Set<BrowserWindow>();
  private burstSend = debounce((evt: WatchEvent) => this.broadcast(evt), 350);

  attach(win: BrowserWindow) {
    this.windows.add(win);
    win.on("closed", () => this.windows.delete(win));
  }

  setPaths(next: VaultPaths) {
    const changed =
      next.mods !== this.paths.mods ||
      next.modPlay !== this.paths.modPlay ||
      next.backup !== this.paths.backup;
    this.paths = { ...this.paths, ...next };
    if (changed) this.rebuild();
  }

  async enable(domain: Domain) {
    // idempotent: if exists and same root, keep; otherwise rebuild that one.
    await this.buildOne(domain);
  }

  async disable(domain: Domain) {
    const w = this.watchers[domain];
    if (w) {
      await w.close().catch(() => {});
      delete this.watchers[domain];
    }
  }

  async disposeAll() {
    await Promise.all(Object.values(this.watchers).map(w => w?.close().catch(() => {})));
    this.watchers = {};
  }

  private async rebuild() {
    await this.disposeAll();
    await Promise.all(["mods", "modPlay", "backup"].map(d => this.buildOne(d as Domain)));
    // Tell UI to do a lightweight refresh after rebuild
    this.broadcast({ domain: "mods", type: "refresh", file: "", at: Date.now() });
    this.broadcast({ domain: "modPlay", type: "refresh", file: "", at: Date.now() });
    this.broadcast({ domain: "backup", type: "refresh", file: "", at: Date.now() });
  }

  private resolveRoot(domain: Domain): string | undefined {
    if (domain === "mods") return this.paths.mods;
    if (domain === "modPlay") return this.paths.modPlay;
    if (domain === "backup") return this.paths.backup;
    return undefined;
  }

  private async buildOne(domain: Domain) {
    const root = this.resolveRoot(domain);
    if (!root) {
      await this.disable(domain);
      return;
    }

    // If watcher exists on same root, keep it
    if (this.watchers[domain] && (this.watchers[domain] as any)._nkRoot === root) {
      return;
    }
    await this.disable(domain);

    const watcher = chokidar.watch(root, {
      ignoreInitial: true,
      persistent: true,
      depth: 99, // deep-watch by default (Phase 3C goal)
      ignored: (p: string) => DEFAULT_IGNORES.test(p),
      awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
    }) as FSWatcher & { _nkRoot?: string };

    watcher._nkRoot = root;

    const send = (type: EventType, file: string) => {
      // Normalize to forward slashes for renderer consistency
      const norm = file.split(path.sep).join("/");
      this.burstSend({ domain, type, file: norm, at: Date.now() });
    };

    watcher
      .on("add", (f) => send("added", f))
      .on("addDir", (f) => send("added", f))
      .on("change", (f) => send("changed", f))
      .on("unlink", (f) => send("removed", f))
      .on("unlinkDir", (f) => send("removed", f))
      .on("error", () => {
        // force a soft refresh on errors
        this.broadcast({ domain, type: "refresh", file: "", at: Date.now() });
      });

    this.watchers[domain] = watcher;
  }

  private broadcast(evt: WatchEvent) {
    for (const win of this.windows) {
      if (!win.isDestroyed()) {
        win.webContents.send("watchers:event", evt);
      }
    }
  }
}

export const watchRegistry = new WatchRegistry();
export type { Domain, VaultPaths, WatchEvent };
