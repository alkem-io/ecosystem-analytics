/**
 * Real-HTTP test harness (features 026/027): listen on port 0, mint session rows, call
 * routes with a cookie. Used by route tests only; it touches no network beyond 127.0.0.1.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type express from 'express';
import { insertSession } from '../cache/session-store.js';

export class HttpHarness {
  private servers: Server[] = [];
  readonly base: Record<string, string> = {};
  private counter = 0;

  async listen(name: string, app: express.Express): Promise<string> {
    const server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    this.servers.push(server);
    this.base[name] = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return this.base[name];
  }

  async close(): Promise<void> {
    await Promise.all(this.servers.map((s) => new Promise((r) => s.close(r))));
    this.servers = [];
  }

  /** A fresh valid session row; returns its cookie header. */
  newSession(opts: { userId?: string; displayName?: string } = {}): string {
    const now = Date.now();
    const sessionId = `sess-${++this.counter}-${now}-${Math.random().toString(36).slice(2)}`;
    insertSession({
      sessionId,
      userId: opts.userId ?? `user-${this.counter}`,
      displayName: opts.displayName ?? 'Tester',
      avatarUrl: null,
      accessTokenEnc: Buffer.from('x'),
      refreshTokenEnc: Buffer.from('y'),
      accessExpiresAt: now + 3_600_000,
      refreshExpiresAt: now + 86_400_000,
      createdAt: now,
      lastSeenAt: now,
    });
    return `ea_session=${sessionId}`;
  }

  async call(
    listener: string,
    path: string,
    opts: { method?: string; body?: unknown; cookie?: string | null } = {},
  ): Promise<{ status: number; json: any }> {
    const headers: Record<string, string> = {};
    if (opts.cookie) headers.cookie = opts.cookie;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${this.base[listener]}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, json };
  }
}
