#!/bin/bash
# Improved deployment build script

# Set error handling
set -e

echo "=== Starting deployment build process ==="

# Install dependencies if needed
echo "Installing dependencies..."
npm install

# Clean dist directory
echo "Cleaning dist directory..."
rm -rf dist
mkdir -p dist

# Run TypeScript compiler with improved options
echo "Building TypeScript files..."
npx tsc -p tsconfig.json --skipLibCheck

# Copy vite.ts to the correct location
echo "Fixing file structure for deployment..."
cp -r dist/server/* dist/
cp dist/vite.config.js dist/

# Create a package.json for deployment
echo "Creating deployment package.json..."
cat > dist/package.json << EOL
{
  "name": "aijobapply-backend",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "overrides": {
    "pdf-parse": {
      "exports": "./lib/pdf-parse.js"
    }
  },
  "dependencies": {
    "@neondatabase/serverless": "^0.9.0",
    "cors": "^2.8.5",
    "dotenv": "^16.5.0",
    "drizzle-orm": "^0.29.0",
    "express": "^4.21.2",
    "express-session": "^1.18.0",
    "connect-pg-simple": "^9.0.0",
    "passport": "^0.7.0",
    "passport-local": "^1.0.0",
    "multer": "^1.4.5-lts.1",
    "nanoid": "^5.0.5",
    "zod": "^3.22.4",
    "stripe": "^14.15.0",
    "ws": "^8.16.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOL

# Create a .env file in dist if it doesn't exist
if [ ! -f dist/.env ]; then
  echo "Creating sample .env file..."
  cat > dist/.env << EOL
# Database connection
DATABASE_URL=postgres://replace-with-actual-url

# Session configuration
SESSION_SECRET=replace-with-long-random-string

# CORS settings
ALLOWED_ORIGIN=https://yourfrontend.com

# Optional Stripe integration
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Environment
NODE_ENV=production
EOL
fi

echo "=== Build completed successfully! ==="
echo "To deploy, upload the contents of the dist directory to your server."
echo "Make sure to set the correct environment variables in your .env file or hosting platform."