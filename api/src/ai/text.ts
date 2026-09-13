// What gets embedded: the title carries most of the meaning, the description adds detail.
export function ticketText(ticket: { title: string; description: string | null }) {
  return ticket.description ? `${ticket.title}\n\n${ticket.description}` : ticket.title;
}

// pgvector's text input format: '[0.1,0.2,...]'.
export function toVectorLiteral(vector: number[]) {
  return `[${vector.join(",")}]`;
}
