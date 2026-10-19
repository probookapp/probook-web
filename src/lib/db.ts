import { Pool, type PoolClient } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * One query at a time per connection, in the order they were asked for.
 *
 * Inside an interactive transaction Prisma holds a single connection, and its
 * query engine still fetches a query's relations in parallel (an `Array.map`
 * of reads). pg queues the extras itself today, but warns that doing so
 * ("Calling client.query() when the client is already executing a query") is
 * deprecated and goes away in pg 9 — at which point those transactions would
 * fail. This makes the queueing ours: each promise-style query waits for the
 * one before it on the same connection.
 *
 * Callback-style calls and Query objects are left alone: they come from pg's
 * own Pool.query, which checks a connection out for exactly one query.
 */
function serializeQueries(client: PoolClient) {
  const run = client.query.bind(client) as (...args: unknown[]) => unknown;
  let tail: Promise<unknown> = Promise.resolve();
  (client as unknown as { query: (...args: unknown[]) => unknown }).query = (...args) => {
    const last = args[args.length - 1];
    const first = args[0] as { submit?: unknown } | undefined;
    if (typeof last === "function" || typeof first?.submit === "function") return run(...args);
    const next = tail.then(() => run(...args));
    tail = next.catch(() => {});
    return next;
  };
}

function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 5,
  });
  // Fired once per physical connection, when the pool opens it.
  pool.on("connect", serializeQueries);
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
