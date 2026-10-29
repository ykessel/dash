# One image: the API, with the built web app served at / (WEB_DIR).
# Build: docker build -t pane .   Run: see docs/ops/production.md

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /src

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/
RUN pnpm install --frozen-lockfile
COPY . .
# No VITE_API_URL: the web app talks to the origin that serves it.
RUN pnpm build \
 && pnpm --dir server build \
 && pnpm --filter @pane/server deploy --prod --legacy /out \
 && cp -r server/dist /out/dist \
 && cp -r dist /out/web

FROM node:22-slim AS run
ENV NODE_ENV=production PORT=3000 WEB_DIR=/app/web
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
