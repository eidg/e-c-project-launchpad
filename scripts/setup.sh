#!/bin/bash

# E C Project Launchpad Setup Script
# This script sets up a clean installation of E C Project Launchpad

set -e

echo "🚀 Setting up E C Project Launchpad..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose > /dev/null 2>&1 && ! docker compose version > /dev/null 2>&1; then
    echo "❌ Docker Compose is not available. Please install Docker Compose and try again."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    
    # Generate secure secrets
    echo "🔐 Generating secure JWT secrets..."
    ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
    REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
    
    # Update .env with generated secrets
    sed -i.bak "s/your-super-secret-access-key-change-in-production-min-32-chars/$ACCESS_SECRET/" .env
    sed -i.bak "s/your-super-secret-refresh-key-change-in-production-min-32-chars/$REFRESH_SECRET/" .env
    rm .env.bak
    
    echo "✅ Environment file created with secure secrets"
else
    echo "✅ Environment file already exists"
fi

# Navigate to infra directory
cd infra

echo "🐳 Building and starting Docker containers..."

# Stop any existing containers
docker compose down

# Build and start all services
docker compose up --build -d

echo "⏳ Waiting for services to be ready..."

# Wait for database to be ready
echo "🗄️  Waiting for database..."
until docker compose exec postgres pg_isready -U postgres > /dev/null 2>&1; do
    sleep 2
done

# Wait for backend API to be ready
echo "🔧 Waiting for backend API..."
until curl -s http://localhost:4000/health > /dev/null 2>&1; do
    sleep 2
done

# Wait for frontend to be ready
echo "🎨 Waiting for frontend..."
until curl -s http://localhost:3000 > /dev/null 2>&1; do
    sleep 2
done

echo "🎉 E C Project Launchpad is ready!"
echo ""
echo "📋 Service URLs:"
echo "   Frontend:  http://localhost:3000"
echo "   Backend:   http://localhost:4000"
echo "   Database:  localhost:5432"
echo "   Adminer:   http://localhost:8080"
echo ""
echo "🔍 To check service status:"
echo "   docker compose ps"
echo ""
echo "📊 To run smoke tests:"
echo "   cd ../scripts && ./smoke/test.sh"
echo ""
echo "🛑 To stop all services:"
echo "   docker compose down"
