# ---- build stage: install everything, generate the Prisma client, compile TypeScript ----
FROM node:24-slim AS build
# Prisma's engines link against OpenSSL, which the slim image leaves out.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# prisma generate reads prisma7.config.ts, which needs *a* DATABASE_URL to exist.
RUN DATABASE_URL=postgresql://build:build@localhost/build npx prisma generate && npm run build

# ---- runtime stage: production dependencies + compiled JS only ----
# Multi-stage builds keep the TypeScript compiler, test tools, and source out of the
# final image: smaller, faster to deploy, less attack surface.
FROM node:24-slim
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY prisma7.config.ts ./

# Don't run as root inside the container.
USER node
EXPOSE 3000
# Apply pending migrations, then start. `migrate deploy` only runs committed
# migrations — it never generates or resets anything, so it's safe on every boot.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
