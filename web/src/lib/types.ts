// Shapes of the JSON the API returns. Kept by hand in sync with api/src/services.

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AiTriage {
  labels: string[];
  priority: Priority;
  provider: string;
  applied: ("priority" | "labels")[];
}

export interface Ticket {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  labels: string[];
  position: number;
  columnId: string;
  boardId: string;
  assigneeId: string | null;
  assignee: User | null;
  aiTriage: AiTriage | null;
  createdAt: string;
  updatedAt: string;
}

export interface Column {
  id: string;
  name: string;
  position: number;
  boardId: string;
  tickets: Ticket[];
}

export interface Member {
  userId: string;
  role: "OWNER" | "MEMBER";
  user: User;
}

export interface BoardSummary {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  _count: { tickets: number; members: number };
}

export interface Board {
  id: string;
  name: string;
  ownerId: string;
  columns: Column[];
  members: Member[];
}

export interface SimilarTicket {
  id: string;
  title: string;
  columnName: string;
  similarity: number;
}

export interface BoardAnalytics {
  byColumn: { columnId: string; name: string; count: number }[];
  byPriority: { priority: Priority; count: number }[];
  topLabels: { label: string; count: number }[];
  createdPerDay: { day: string; count: number }[];
  aiTriaged: { triaged: number; total: number };
}
