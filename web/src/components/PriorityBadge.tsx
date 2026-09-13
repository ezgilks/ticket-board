import type { Priority } from "../lib/types";

const styles: Record<Priority, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-sky-100 text-sky-700",
  HIGH: "bg-amber-100 text-amber-800",
  URGENT: "bg-red-100 text-red-700",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${styles[priority]}`}>{priority.toLowerCase()}</span>;
}
