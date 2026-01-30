# Multi-stage build for Vue 3 + Vite application with nginx

# Stage 1: Build the application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production nginx server
FROM nginx:alpine

# Install Python, pip, and common utilities
RUN apk add --no-cache \
    python3 \
    py3-pip \
    curl \
    wget \
    traceroute \
    iputils \
    bind-tools \
    vim \
    jq \
    && ln -sf python3 /usr/bin/python

# Install Python requests library
RUN pip3 install --no-cache-dir requests && \
    ln -sf pip3 /usr/bin/pip

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy tool verification script
COPY test-tools.sh /test-tools.sh
RUN chmod +x /test-tools.sh

# Copy Python examples
COPY examples/ /examples/
RUN chmod +x /examples/*.py 2>/dev/null || true

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
