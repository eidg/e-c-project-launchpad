#!/bin/bash

# E C Project Launchpad Validation Script
# This script validates that all services are working correctly after setup

set -e

echo "🔍 Validating E C Project Launchpad installation..."

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Please run this script from the infra/ directory"
    exit 1
fi

# Function to check if a service is responding
check_service() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo "🔍 Checking $name at $url..."
    
    if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "$expected_status"; then
        echo "✅ $name is responding correctly"
        return 0
    else
        echo "❌ $name is not responding correctly"
        return 1
    fi
}

# Function to check database connection
check_database() {
    echo "🔍 Checking database connection..."
    
    if docker compose exec -T postgres psql -U postgres -d e_c_project_launchpad -c "SELECT 1;" > /dev/null 2>&1; then
        echo "✅ Database is accessible"
        return 0
    else
        echo "❌ Database is not accessible"
        return 1
    fi
}

# Function to check database schema
check_database_schema() {
    echo "🔍 Checking database schema..."
    
    # Check if required tables exist
    tables=("users" "refresh_tokens" "conversations" "messages")
    
    for table in "${tables[@]}"; do
        if docker compose exec -T postgres psql -U postgres -d e_c_project_launchpad -c "\dt $table" | grep -q "$table"; then
            echo "✅ Table '$table' exists"
        else
            echo "❌ Table '$table' is missing"
            return 1
        fi
    done
    
    return 0
}

# Function to check authentication endpoints
check_auth_endpoints() {
    echo "🔍 Checking authentication endpoints..."
    
    # Test signup endpoint
    local signup_response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"email":"test@example.com","password":"testpassword123"}' \
        http://localhost:4000/api/auth/signup)
    
    if echo "$signup_response" | grep -q "400\|409\|201"; then
        echo "✅ Signup endpoint is working"
    else
        echo "❌ Signup endpoint is not working properly"
        return 1
    fi
    
    return 0
}

# Main validation
echo "📊 Starting validation checks..."
echo ""

# Check Docker containers are running
echo "🐳 Checking Docker containers..."
if ! docker compose ps | grep -q "Up"; then
    echo "❌ Docker containers are not running. Please run 'docker compose up -d' first."
    exit 1
fi
echo "✅ Docker containers are running"
echo ""

# Wait a moment for services to be fully ready
echo "⏳ Waiting for services to be fully ready..."
sleep 5

# Check individual services
VALIDATION_FAILED=0

check_service "Frontend" "http://localhost:3000" "200" || VALIDATION_FAILED=1
check_service "Backend API Health" "http://localhost:4000/health" "200" || VALIDATION_FAILED=1
check_service "Adminer" "http://localhost:8080" "200" || VALIDATION_FAILED=1

echo ""

# Check database
check_database || VALIDATION_FAILED=1
check_database_schema || VALIDATION_FAILED=1

echo ""

# Check authentication
check_auth_endpoints || VALIDATION_FAILED=1

echo ""

# Final result
if [ $VALIDATION_FAILED -eq 0 ]; then
    echo "🎉 All validation checks passed!"
    echo ""
    echo "✅ E C Project Launchpad is fully functional and ready to use:"
    echo "   • Frontend: http://localhost:3000"
    echo "   • Backend API: http://localhost:4000"
    echo "   • Database Admin: http://localhost:8080"
    echo ""
    echo "🚀 You can now:"
    echo "   • Create an account at http://localhost:3000"
    echo "   • Start chatting with the AI assistant"
    echo "   • Manage conversations and chat history"
    exit 0
else
    echo "❌ Some validation checks failed!"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "   • Check container logs: docker compose logs"
    echo "   • Restart services: docker compose restart"
    echo "   • Rebuild containers: docker compose up --build -d"
    echo ""
    echo "📞 If issues persist, check the documentation or open an issue."
    exit 1
fi
