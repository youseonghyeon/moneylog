# syntax=docker/dockerfile:1
# Node 한 프로세스가 vite build 결과(dist/)와 /api 를 같이 서빙한다 (비특권 node 사용자, 8080).
# 서버 TS 는 Node 24 타입 제거로 바로 실행 — 서버 빌드 단계 없음. DB 는 /data(PVC) 의 SQLite 파일.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
# 타입 검사와 테스트는 CI 게이트에서 먼저 돈다. 여기서는 번들만 만든다.
RUN npx vite build

# 런타임 의존성(hono)만. 화면 라이브러리·폰트는 번들에 들어가 devDependencies 에 있다.
FROM --platform=$BUILDPLATFORM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DB_PATH=/data/moneylog.db STATIC_DIR=/app/dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/core ./src/core
COPY src/server ./src/server
COPY --from=build /src/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "src/server/main.ts"]
