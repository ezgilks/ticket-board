import { getRedis } from "./redis.js";

// Cache-aside for the full board payload — the heaviest read in the app (board +
// columns + tickets + members, in one big join). Pattern:
//   read:  try the cache → on a miss, query Postgres and store the result
//   write: delete the cache entry (see publishBoardEvent), so the next read rebuilds it
//
// Deleting on write, rather than updating the cached copy, means the cache can't
// drift from the database. The TTL is a safety net, not the main invalidation.

const TTL_SECONDS = 300;
const key = (boardId: string) => `board:${boardId}:full`;

// A cache is an optimisation: if Redis misbehaves, log and fall back to Postgres.
export async function getCachedBoard<T>(boardId: string): Promise<T | null> {
  try {
    const raw = await getRedis()?.get(key(boardId));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    console.error("[cache] read failed", err);
    return null;
  }
}

export async function setCachedBoard(boardId: string, board: unknown) {
  try {
    await getRedis()?.set(key(boardId), JSON.stringify(board), { EX: TTL_SECONDS });
  } catch (err) {
    console.error("[cache] write failed", err);
  }
}

export async function invalidateBoard(boardId: string) {
  try {
    await getRedis()?.del(key(boardId));
  } catch (err) {
    console.error("[cache] invalidate failed", err);
  }
}
