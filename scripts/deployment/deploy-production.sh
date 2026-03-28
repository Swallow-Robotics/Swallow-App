#!/bin/bash

# Deploy to production environment
set -e

echo "🚀 Deploying to production environment..."

# Check if required environment variables are set
if [ -z "$PRODUCTION_DEPLOY_KEY" ]; then
    echo "❌ PRODUCTION_DEPLOY_KEY environment variable is required"
    exit 1
fi

# Run tests before deployment
echo "🧪 Running tests..."
./scripts/development/run-tests.sh

# Build frontend for production
echo "📦 Building frontend for production..."
cd client
yarn build
cd ..

# Deploy backend
echo "🐍 Deploying backend..."
cd server
# TODO: Add actual deployment commands
echo "Backend deployment commands would go here"
cd ..

echo "✅ Production deployment completed!"
