import { createSchema, createYoga, maskError } from "graphql-yoga";
import { config } from "../config.js";
import { HttpError } from "../lib/errors.js";
import { verifyToken } from "../lib/jwt.js";
import { createLoaders } from "./loaders.js";
import { type GraphQLContext, resolvers } from "./resolvers.js";
import { typeDefs } from "./schema.js";

// GraphQL lives alongside REST, not instead of it: REST handles writes and the
// real-time flow; GraphQL serves flexible, read-heavy board queries.
export const yoga = createYoga<object, GraphQLContext>({
  schema: createSchema({ typeDefs, resolvers }),
  graphqlEndpoint: "/graphql",
  // The in-browser query explorer — handy locally, off in production.
  graphiql: config.NODE_ENV !== "production",
  landingPage: false,

  // Build per-request context: who is asking, plus fresh DataLoaders.
  context: ({ request }) => {
    const header = request.headers.get("authorization");
    let userId: string | null = null;
    if (header?.startsWith("Bearer ")) {
      try {
        userId = verifyToken(header.slice("Bearer ".length));
      } catch {
        userId = null;
      }
    }
    return { userId, loaders: createLoaders() };
  },

  // By default Yoga hides error messages (they could leak internals). Our own
  // HttpErrors are safe to show, so pass those through with a code.
  maskedErrors: {
    maskError(error, message, isDev) {
      const original = (error as { originalError?: unknown }).originalError;
      if (original instanceof HttpError) {
        return Object.assign(error as Error, {
          message: original.message,
          extensions: { code: original.status === 401 ? "UNAUTHENTICATED" : `HTTP_${original.status}` },
        });
      }
      return maskError(error, message, isDev);
    },
  },
});
