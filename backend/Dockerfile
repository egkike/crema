# Etapa 1: Builder
FROM node:22-slim AS builder
RUN apt-get update && apt-get upgrade -y

WORKDIR /app

# Activamos el pnpm (corepack)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Configuramos pnpm para que use una estructura plana (hoisted)
# Esto garantiza que 'pino' esté donde Node lo busca
RUN pnpm config set node-linker hoisted

COPY package.json pnpm-lock.yaml ./
COPY tsconfig.json tsconfig.build.json ./

RUN pnpm install --frozen-lockfile

COPY src/ ./src/

# Compila el proyecto
RUN pnpm build

# Etapa 2: Imagen final
FROM node:22-alpine
RUN apk update && apk upgrade --no-cache

WORKDIR /app

# Copiamos lo que construiste (ahora son archivos reales, no links)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# --- PREPARACIÓN DE CARPETAS Y PERMISOS ---
# Creamos logs y uploads en una sola línea para optimizar la imagen
RUN mkdir -p /app/logs /app/uploads && \
    addgroup -S crema && \
    adduser -S crema -G crema && \
    chown -R crema:crema /app

# Cambiamos al usuario
USER crema

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]