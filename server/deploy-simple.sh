#!/bin/bash
# Simple deployment script for Railway with ESM support

set -e

echo "=== Starting Railway deployment process ==="

# Clean previous build artifacts
echo "Cleaning previous build artifacts..."
rm -rf dist

# Build TypeScript with ESM support
echo "Building TypeScript files..."
./build.sh

# Check if build was successful
if [ $? -ne 0 ]; then
    echo "Build failed! Aborting deployment."
    exit 1
fi

echo "=== Build successful, deploying to Railway ==="

# # Change into the correct deployment directory
# # and deploy to Railway
# ( cd dist/server && \
#     echo "Deploying to Railway..." && \
#     railway up )

# echo "✅ Deployment process complete"
