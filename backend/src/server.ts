import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const seatSections = [
  { id: 'A', rows: 16, seatsPerRow: 18 },
  { id: 'B', rows: 16, seatsPerRow: 18 },
  { id: 'C', rows: 16, seatsPerRow: 18 },
];

const seatStatuses: Array<'available' | 'reserved' | 'sold' | 'held'> = ['available', 'reserved', 'sold', 'held'];

const randomSeatId = () => {
  const section = seatSections[Math.floor(Math.random() * seatSections.length)];
  const row = Math.floor(Math.random() * section.rows) + 1;
  const seat = Math.floor(Math.random() * section.seatsPerRow) + 1;
  return `${section.id}-${row}-${seat}`;
};

type UserPayload = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

type CacheEntry = {
  value: UserPayload;
  expiresAt: number;
};

class LruCache {
  private cache = new Map<string, CacheEntry>();
  private pendingFetches = new Map<string, Promise<UserPayload>>();
  private hits = 0;
  private misses = 0;

  constructor(private readonly maxEntries = 200, private readonly ttlMs = 60_000) {
    const interval = setInterval(() => this.cleanup(), 15_000);
    if (typeof (interval as any).unref === 'function') {
      (interval as any).unref();
    }
  }

  private totalResponseMs = 0;
  private responseCount = 0;

  getStats() {
    return {
      size: this.cache.size,
      ttlMs: this.ttlMs,
      hits: this.hits,
      misses: this.misses,
      averageResponseMs: this.responseCount ? Math.round(this.totalResponseMs / this.responseCount) : 0,
    };
  }

  recordResponseTime(ms: number) {
    this.totalResponseMs += ms;
    this.responseCount += 1;
  }

  get(key: string): UserPayload | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses += 1;
      return undefined;
    }

    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits += 1;
    return entry.value;
  }

  async getOrFetch(key: string, fetcher: () => Promise<UserPayload>): Promise<UserPayload> {
    const cached = this.get(key);
    if (cached) return cached;

    const pending = this.pendingFetches.get(key);
    if (pending) {
      return pending;
    }

    const promise = fetcher()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.pendingFetches.delete(key);
      });

    this.pendingFetches.set(key, promise);
    return promise;
  }

  set(key: string, value: UserPayload) {
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value as string;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }
}

class AsyncQueue {
  private pending: Array<() => void> = [];
  private active = 0;

  constructor(private readonly concurrency = 2) {}

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = () => {
        this.active += 1;
        task()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.active -= 1;
            this.dequeue();
          });
      };

      this.pending.push(run);
      this.dequeue();
    });
  }

  private dequeue() {
    if (this.active >= this.concurrency) return;
    const next = this.pending.shift();
    if (next) next();
  }
}

const userCache = new LruCache(300, 60_000);
const fetchQueue = new AsyncQueue(3);
const userStore = new Map<string, UserPayload>([
  ['1', { id: '1', name: 'John Doe', email: 'john@example.com', createdAt: new Date().toISOString() }],
  ['2', { id: '2', name: 'Jane Smith', email: 'jane@example.com', createdAt: new Date().toISOString() }],
  ['3', { id: '3', name: 'Alice Johnson', email: 'alice@example.com', createdAt: new Date().toISOString() }],
]);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createUser = (id: string): UserPayload => {
  const user: UserPayload = {
    id,
    name: `User ${id}`,
    email: `${id}@example.com`,
    createdAt: new Date().toISOString(),
  };
  userStore.set(id, user);
  return user;
};

const fetchUserFromDb = async (id: string): Promise<UserPayload> => {
  await delay(200);
  return userStore.get(id) ?? createUser(id);
};

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    userCache.recordResponseTime(Date.now() - start);
  });
  next();
});

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'welcome', message: 'Live seat updates connected.' }));
});

const broadcastSeatUpdate = (seatId: string, status: 'available' | 'reserved' | 'sold' | 'held') => {
  const payload = JSON.stringify({ type: 'seat-update', seatId, status });
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  });
};

setInterval(() => {
  const seatId = randomSeatId();
  const status = seatStatuses[Math.floor(Math.random() * seatStatuses.length)];
  broadcastSeatUpdate(seatId, status);
}, 4500);

const rateLimiter = new Map<string, { tokens: number; last: number; burstTokens: number; burstLast: number }>();

const ensureRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const ipKey = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const state = rateLimiter.get(ipKey) ?? { tokens: 10, last: now, burstTokens: 5, burstLast: now };

  const tokenRefill = Math.min(10, state.tokens + ((now - state.last) / 60000) * 10);
  const burstRefill = Math.min(5, state.burstTokens + ((now - state.burstLast) / 10000) * 5);
  state.tokens = tokenRefill;
  state.burstTokens = burstRefill;
  state.last = now;
  state.burstLast = now;

  if (state.burstTokens >= 1) {
    state.burstTokens -= 1;
  } else if (state.tokens >= 1) {
    state.tokens -= 1;
  } else {
    rateLimiter.set(ipKey, state);
    res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
    return;
  }

  rateLimiter.set(ipKey, state);
  next();
};

app.get('/users/:id', ensureRateLimit, async (req, res) => {
  const { id } = req.params;
  if (!id.trim()) {
    res.status(400).json({ error: 'User ID is required.' });
    return;
  }

  try {
    const user = await userCache.getOrFetch(id, () => fetchQueue.enqueue(() => fetchUserFromDb(id)));
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Unable to fetch user.' });
  }
});

app.post('/users', (req, res) => {
  const { id, name, email } = req.body as Partial<UserPayload>;
  if (!id || !name || !email) {
    res.status(400).json({ error: 'id, name, and email are required.' });
    return;
  }

  const user: UserPayload = {
    id,
    name,
    email,
    createdAt: new Date().toISOString(),
  };
  userStore.set(id, user);
  userCache.set(id, user);
  res.status(201).json(user);
});

app.get('/cache-status', (_req, res) => {
  res.json(userCache.getStats());
});

app.delete('/cache', (_req, res) => {
  userCache.clear();
  res.json({ success: true });
});

app.get('/', (_req, res) => {
  res.json({ status: 'running', message: 'User data API with cache and WebSocket updates' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Server error.' });
});

server.listen(PORT, () => {
  console.log(`Backend API listening on http://localhost:${PORT}`);
  console.log(`WebSocket updates available at ws://localhost:${PORT}/ws`);
});
