# Build Docker image and test installed tools (PowerShell version)

$ErrorActionPreference = "Stop"

$IMAGE_NAME = "loki-viewer"
$IMAGE_TAG = "latest"

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Building Docker Image" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host

# Build the image
docker build -t "${IMAGE_NAME}:${IMAGE_TAG}" .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host
Write-Host "✓ Build completed successfully!" -ForegroundColor Green
Write-Host

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Testing Tools in Container" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host

# Run a temporary container to test tools
$CONTAINER_ID = docker run -d --rm "${IMAGE_NAME}:${IMAGE_TAG}"

Write-Host "Container ID: $CONTAINER_ID"
Write-Host

# Wait for container to start
Start-Sleep -Seconds 2

# Test tools
Write-Host "Running tool verification..." -ForegroundColor Yellow
docker exec $CONTAINER_ID sh /test-tools.sh

Write-Host
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Testing Python Example" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host

# Test Python example (will fail if Loki not running, but that's ok)
Write-Host "Note: This will show errors if Loki is not running - that's expected" -ForegroundColor Yellow
try {
    docker exec $CONTAINER_ID python3 /examples/query-loki.py
} catch {
    Write-Host "Expected error (Loki not running)" -ForegroundColor Yellow
}

# Stop the container
Write-Host
Write-Host "Stopping test container..." -ForegroundColor Yellow
docker stop $CONTAINER_ID 2>$null | Out-Null

Write-Host
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Image Information" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host

# Show image info
docker images "${IMAGE_NAME}:${IMAGE_TAG}"

Write-Host
Write-Host "================================" -ForegroundColor Green
Write-Host "Build and Test Completed!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host
Write-Host "To run the container:" -ForegroundColor Cyan
Write-Host "  docker run -d -p 8080:80 --name loki-viewer ${IMAGE_NAME}:${IMAGE_TAG}" -ForegroundColor White
Write-Host
Write-Host "To test tools in running container:" -ForegroundColor Cyan
Write-Host "  docker exec loki-viewer sh /test-tools.sh" -ForegroundColor White
Write-Host
Write-Host "To run Python example:" -ForegroundColor Cyan
Write-Host "  docker exec loki-viewer python3 /examples/query-loki.py" -ForegroundColor White
Write-Host
