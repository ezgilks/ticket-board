import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../lib/api";
import type { BoardSummary } from "../lib/types";
import { Header } from "../components/Header";

export function BoardsPage() {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ boards: BoardSummary[] }>("GET", "/boards")
      .then((res) => setBoards(res.boards))
      .catch((err) => setError(err.message));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await api<{ board: BoardSummary }>("POST", "/boards", { name });
    setBoards((prev) => [{ ...res.board, _count: { tickets: 0, members: 1 } }, ...(prev ?? [])]);
    setName("");
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-4 text-xl font-semibold">Your boards</h1>

        <form onSubmit={onCreate} className="mb-6 flex gap-2">
          <input
            className="input mt-0 max-w-xs"
            placeholder="New board name"
            aria-label="New board name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn-primary">
            Create
          </button>
        </form>

        {error && <p className="text-red-600">{error}</p>}
        {boards === null && !error && <p className="text-slate-500">Loading…</p>}
        {boards?.length === 0 && <p className="text-slate-500">No boards yet — create one above.</p>}

        <ul className="grid gap-3 sm:grid-cols-2">
          {boards?.map((b) => (
            <li key={b.id}>
              <Link
                to={`/boards/${b.id}`}
                className="block rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-indigo-300"
              >
                <p className="font-medium">{b.name}</p>
                <p className="text-sm text-slate-500">
                  {b._count.tickets} tickets · {b._count.members} members
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
