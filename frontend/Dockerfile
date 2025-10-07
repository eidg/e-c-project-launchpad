FROM node:20-alpine
ARG VERSION=0.0.1
WORKDIR /app

# Copy package files and install dependencies with npm
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Install any new dependencies that might have been added
RUN npm install

EXPOSE 3000
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "3000"]
LABEL org.opencontainers.image.version=${VERSION}
