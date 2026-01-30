#!/bin/bash
#
# Build Docker image and test installed tools
#

set -e

IMAGE_NAME="loki-viewer"
IMAGE_TAG="latest"

echo "================================"
echo "Building Docker Image"
echo "================================"
echo

# Build the image
docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .

echo
echo "✓ Build completed successfully!"
echo

echo "================================"
echo "Testing Tools in Container"
echo "================================"
echo

# Run a temporary container to test tools
CONTAINER_ID=$(docker run -d --rm ${IMAGE_NAME}:${IMAGE_TAG})

echo "Container ID: $CONTAINER_ID"
echo

# Wait for container to start
sleep 2

# Test tools
echo "Running tool verification..."
docker exec $CONTAINER_ID sh /test-tools.sh

echo
echo "================================"
echo "Testing Python Example"
echo "================================"
echo

# Test Python example (will fail if Loki not running, but that's ok)
echo "Note: This will show errors if Loki is not running - that's expected"
docker exec $CONTAINER_ID python3 /examples/query-loki.py || true

# Stop the container
echo
echo "Stopping test container..."
docker stop $CONTAINER_ID > /dev/null 2>&1 || true

echo
echo "================================"
echo "Image Information"
echo "================================"
echo

# Show image info
docker images ${IMAGE_NAME}:${IMAGE_TAG}

echo
echo "================================"
echo "Build and Test Completed!"
echo "================================"
echo
echo "To run the container:"
echo "  docker run -d -p 8080:80 --name loki-viewer ${IMAGE_NAME}:${IMAGE_TAG}"
echo
echo "To test tools in running container:"
echo "  docker exec loki-viewer sh /test-tools.sh"
echo
echo "To run Python example:"
echo "  docker exec loki-viewer python3 /examples/query-loki.py"
echo
