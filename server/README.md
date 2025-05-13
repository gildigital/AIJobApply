# AIJobApply Server

## Deployment Instructions

When deploying to Railway, follow these steps:

1. Run the deployment script:
   ```
   ./deploy-simple.sh
   ```

2. This will create a `dist` directory with the necessary files.

3. Configure Railway to:
   - Use the `dist` directory as the source
   - Set the following environment variables:
     - `DATABASE_URL`: Your database connection string
     - `SESSION_SECRET`: A secure random string
     - `ALLOWED_ORIGIN`: Your frontend URL (for CORS)
     - `NODE_ENV`: Set to `production`

4. Deploy using:
   ```
   railway up
   ```

## Troubleshooting

If you encounter module import errors related to `vite`, make sure the deployment script has been run correctly. The error is typically caused by incorrect file paths in the build.

The most common error is:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/dist/vite'
```

Fix by running the deployment script properly and ensuring all files are in the correct location.