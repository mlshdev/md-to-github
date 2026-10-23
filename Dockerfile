# update-policy: minor
FROM docker.io/oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS install
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM install AS build
COPY tsconfig.json ./
COPY src ./src
RUN bun run build

# update-policy: minor
FROM docker.io/oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS runtime
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
