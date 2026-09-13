// The GraphQL schema: a typed description of everything a client may ask for.
// Clients pick exactly the fields they need in one request — e.g. a mobile view
// could fetch ticket titles only, without the descriptions REST would send.
export const typeDefs = /* GraphQL */ `
  enum Priority {
    LOW
    MEDIUM
    HIGH
    URGENT
  }

  type User {
    id: ID!
    name: String!
    email: String!
  }

  type Member {
    role: String!
    user: User!
  }

  type AiTriage {
    labels: [String!]!
    priority: Priority!
    provider: String!
    applied: [String!]!
  }

  type Ticket {
    id: ID!
    title: String!
    description: String
    priority: Priority!
    labels: [String!]!
    position: Float!
    createdAt: String!
    updatedAt: String!
    assignee: User
    aiTriage: AiTriage
  }

  type Column {
    id: ID!
    name: String!
    position: Int!
    tickets(priority: Priority, label: String): [Ticket!]!
  }

  type Board {
    id: ID!
    name: String!
    createdAt: String!
    owner: User!
    members: [Member!]!
    columns: [Column!]!
    analytics: BoardAnalytics!
  }

  type ColumnCount {
    columnId: ID!
    name: String!
    count: Int!
  }
  type PriorityCount {
    priority: Priority!
    count: Int!
  }
  type LabelCount {
    label: String!
    count: Int!
  }
  type DayCount {
    day: String!
    count: Int!
  }
  type AiCoverage {
    triaged: Int!
    total: Int!
  }

  type BoardAnalytics {
    byColumn: [ColumnCount!]!
    byPriority: [PriorityCount!]!
    topLabels: [LabelCount!]!
    createdPerDay: [DayCount!]!
    aiTriaged: AiCoverage!
  }

  type Query {
    me: User!
    boards: [Board!]!
    board(id: ID!): Board
  }
`;
