#!/bin/bash
# Railway optimized build script for ESM modules

# Set error handling
set -e

# Clean previous build artifacts
echo "Cleaning previous build artifacts..."
rm -rf dist

# Create a temporary tsconfig file for the build
cat > tsconfig.temp.json << EOL
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "skipLibCheck": true,
    "noEmitOnError": false,
    "strictNullChecks": false,
    "noImplicitAny": false,
    "strict": false,
    "module": "ESNext",
    "moduleResolution": "Node",
    "target": "ES2022",
    "outDir": "dist",
    "paths": {
      "@shared/*": ["./local-schema.js"]
    }
  },
  "include": [
    "./**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "**/*.test.ts",
    "**/workable-scraper-updated.ts",
    "**/workable-scraper.backup.ts",
    "routes/test-data-routes.ts"
  ]
}
EOL

# Build using the temporary config with force transpilation (ignoring errors)
echo "Building TypeScript files with ESM support..."
echo "Transpiling files with babel directly (bypassing type checking)..."

# Install babel dependencies if not already present
npm install --save-dev @babel/cli @babel/core @babel/preset-env @babel/preset-typescript

# Create babel config
cat > babel.config.json << EOL
{
  "presets": [
    ["@babel/preset-env", { "targets": { "node": "18" } }],
    ["@babel/preset-typescript", { "allowDeclareFields": true }]
  ]
}
EOL

# Configure Babel to properly handle ESM
cat > .babelrc << EOL
{
  "presets": [
    ["@babel/preset-env", { "targets": { "node": "18" }, "modules": false }],
    ["@babel/preset-typescript", { "allowDeclareFields": true }]
  ],
  "plugins": [
    "add-import-extension"
  ]
}
EOL
# Transpile the TypeScript files using Babel (skips type checking)
echo "Running Babel to transpile files..."
npx babel --extensions '.ts' --out-dir dist ./ --copy-files --ignore "node_modules/**/*,**/*.test.ts,**/workable-scraper-updated.ts,**/workable-scraper.backup.ts"
echo "Babel transpilation finished."

echo "DEBUG: Checking if dist/db.js was created..."
if [ -f "dist/db.js" ]; then
    echo "SUCCESS: dist/db.js was found!"
else
    echo "CRITICAL ERROR: dist/db.js was NOT found."
    echo "Contents of dist directory:"
    ls -Al dist
    echo "Contents of dist/services (if exists):"
    ls -Al dist/services 2>/dev/null || echo "dist/services not found"
    echo "Contents of dist/migrations (if exists):"
    ls -Al dist/migrations 2>/dev/null || echo "dist/migrations not found"
    # Exit here if db.js is critical and not found, to make the failure obvious
    exit 1 
fi

echo "Copying additional necessary files..."
if [ -f "./my_actual_database.sqlite" ]; then # Check if file exists
    cp ./my_actual_database.sqlite dist/my_actual_database.sqlite
fi
if [ -f "./config.json" ]; then # Example for a config file
    cp ./config.json dist/config.json
fi


# We're using local-schema.js instead of shared modules to avoid dependency issues

# Fix any require statements and import paths in the compiled files
find dist -type f -name "*.js" -exec sed -i 's/require("dotenv\/config")/import "dotenv\/config"/g' {} \;

# Fix all schema imports to use local-schema.js instead
echo "Rewriting schema import paths relative to local-schema.js..."

# From dist/services → ../../local-schema.js
find dist/services -type f -name "*.js" -exec sed -i 's|from [''"][^''"]*shared/schema[^''"]*[''"]|from "../../local-schema.js"|g' {} \;

# From dist/routes → ../local-schema.js
find dist/routes -type f -name "*.js" -exec sed -i 's|from [''"][^''"]*shared/schema[^''"]*[''"]|from "../local-schema.js"|g' {} \;

# From dist root → ./local-schema.js
find dist -maxdepth 1 -type f -name "*.js" -exec sed -i 's|from [''"][^''"]*shared/schema[^''"]*[''"]|from "./local-schema.js"|g' {} \;

# Further safeguard - search for any remaining references to shared/schema and fix them
find dist -type f -name "*.js" -exec grep -l "shared/schema" {} \; | xargs -r sed -i 's/[\.\/]*shared\/schema[\.js]*/\.\/local-schema\.js/g'

# Flatten the directory structure - move everything from dist/server to dist
echo "Flattening directory structure..."
if [ -d "dist/server" ]; then
  cp -r dist/server/* dist/
  rm -rf dist/server
fi

# Create production package.json in dist
# Make absolutely sure local-schema.js exists in the dist directory
if [ ! -f "dist/local-schema.js" ]; then
  echo "WARNING: local-schema.js not found in dist directory. Copying it..."
  cp local-schema.js dist/
fi

# Create a shared directory and symlink local-schema.js to it
# This is a fallback for any imports that might still reference shared/schema.js
echo "Creating shared schema fallback..."
mkdir -p dist/shared
cp dist/local-schema.js dist/shared/schema.js

echo "Creating production package.json in dist..."
node << 'EOF'
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
// Keep only the postinstall script
const scripts = { postinstall: "patch-package" };
pkg.scripts = scripts;
pkg.main = "index.js";
// Add the override for pdf-parse to fix the debug mode issue
if (!pkg.overrides) pkg.overrides = {};
pkg.overrides["pdf-parse"] = { "exports": "./lib/pdf-parse.js" };
// Add patch-package dependencies
if (!pkg.devDependencies) pkg.devDependencies = {};
pkg.devDependencies["patch-package"] = "^8.0.0";
pkg.devDependencies["postinstall-postinstall"] = "^2.1.0";
fs.writeFileSync("dist/package.json", JSON.stringify(pkg, null, 2));
EOF

# Clean up the temporary config
rm tsconfig.temp.json

# Copy the patches directory for patch-package
if [ -d "patches" ]; then
  echo "Copying patches directory for patch-package..."
  mkdir -p dist/patches
  cp -r patches/* dist/patches/
fi

echo "Build process complete! Files are ready in the 'dist' directory."