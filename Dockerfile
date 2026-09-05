# update-policy: minor
FROM docker.io/oven/bun:1.4.1@sha256:9e123d5fc069e29d519fd4c981afb61b8542ac80274771961136db1e4538d53e AS install
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM install AS build
COPY tsconfig.json ./
COPY src ./src
RUN bun run build

# update-policy: minor
FROM docker.io/oven/bun:1.4.1@sha256:9e123d5fc069e29d519fd4c981afb61b8542ac80274771961136db1e4538d53e AS runtime
WORKDIR /app

ENV CONTENT_ROOT=/data \
    NODE_ENV=production \
    PORT=3000

RUN mkdir -p /data && chown bun:bun /data

COPY --from=build --chown=bun:bun /app/dist ./dist
COPY --chown=bun:bun src/index.html ./dist/index.html

USER bun
EXPOSE 3000/tcp

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["bun", "-e", "const response = await fetch('http://127.0.0.1:3000/healthz'); if (!response.ok) process.exit(1)"]

ENTRYPOINT ["bun", "run", "dist/server.js"]
