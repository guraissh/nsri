FROM oven/bun:1 AS base

WORKDIR /app

# Install dependencies
COPY package.json bun.lock netscape-cookies-parser-1.0.3.tgz app/ ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Production stage
FROM oven/bun:1-slim

WORKDIR /app

# Copy built files and dependencies
COPY --from=base /app/build ./build
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/app ./app

# Create directories for data persistence
RUN mkdir -p /app/public/thumbnails /app/data

# Expose port
EXPOSE 3000

# Start the server
CMD ["bun", "run", "start"]
