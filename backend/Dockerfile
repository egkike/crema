# Etapa 1: Builder
FROM node:22-slim AS builder
RUN apt-get update && apt-get upgrade -y

WORKDIR /app

# Activamos el pnpm (corepack)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Configuramos pnpm para que use una estructura plana (hoisted)
RUN pnpm config set node-linker hoisted

# Copiamos archivos del workspace (raíz)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Instalamos todas las dependencias del workspace
RUN pnpm install --frozen-lockfile

# Copiamos el código fuente del backend
COPY backend/src/ ./backend/src/
COPY backend/package.json ./backend/package.json
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/tsconfig.build.json ./backend/tsconfig.build.json

# Compila el proyecto desde el directorio backend
WORKDIR /app/backend
RUN pnpm build

# Etapa 2: Imagen final
FROM node:22-alpine
RUN apk update && apk upgrade --no-cache

WORKDIR /app

# Copiamos archivos del workspace para instalar dependencias
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/

# Activar pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm config set node-linker hoisted

# Instalamos todas las dependencias del workspace
RUN pnpm install --frozen-lockfile

# Copiamos el build
COPY --from=builder /app/backend/dist ./dist

# --- PREPARACIÓN DE CARPETAS ---
RUN mkdir -p /app/logs /app/uploads

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]