FROM node:20-alpine
ARG VERSION=0.0.1
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ libc6-compat

# Copy package files and install dependencies
COPY package.json ./
RUN corepack enable pnpm && pnpm i --prod

# Copy source code
COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "src/index.js"]
LABEL org.opencontainers.image.version=${VERSION}
