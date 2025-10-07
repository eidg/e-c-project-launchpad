#!/usr/bin/env bash
set -e

echo "🔍 Running container smoke tests..."

# Change to infra directory where docker-compose.yml is located
cd "$(dirname "$0")/../../infra"

expected=(frontend backend-api langgraph-service mcp-service postgres adminer)

for service in "${expected[@]}"; do
  echo "Checking $service..."
  if docker compose ps "$service" | grep -q "Up"; then
    echo "✅ $service is running"
  else
    echo "❌ $service is not running"
    exit 1
  fi
done

echo "🎉 All services are healthy!"
