# LFMS Environment Variables

This document lists all environment variables required for the Livestock Farm Management System (LFMS).

## Database

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `DATABASE_URL` | String | MySQL/TiDB connection string | `mysql://user:password@localhost:3306/lfms` |

## Authentication & OAuth

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `VITE_APP_ID` | String | Manus OAuth Application ID | `your_app_id_here` |
| `OAUTH_SERVER_URL` | String | Manus OAuth Server URL (backend) | `https://api.manus.im` |
| `VITE_OAUTH_PORTAL_URL` | String | Manus OAuth Portal URL (frontend login) | `https://auth.manus.im` |
| `JWT_SECRET` | String | JWT Secret for session cookie signing (min 32 chars) | `your_jwt_secret_here_min_32_chars` |

## Owner Information

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `OWNER_OPEN_ID` | String | Owner's Manus OpenID (unique identifier) | `your_owner_open_id_here` |
| `OWNER_NAME` | String | Owner's display name | `Farm Owner Name` |

## Built-In Forge API (Manus Platform Services)

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `BUILT_IN_FORGE_API_URL` | String | Server-side API URL for LLM, storage, notifications | `https://api.manus.im/forge` |
| `BUILT_IN_FORGE_API_KEY` | String | Server-side API key (Bearer token for backend) | `your_forge_api_key_here` |
| `VITE_FRONTEND_FORGE_API_KEY` | String | Frontend API key (Bearer token for client-side) | `your_frontend_forge_api_key_here` |
| `VITE_FRONTEND_FORGE_API_URL` | String | Frontend API URL (for client-side calls) | `https://api.manus.im/forge` |

## Application Branding

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `VITE_APP_TITLE` | String | App title (browser tab, sidebar) | `Livestock Farm Management System` |
| `VITE_APP_LOGO` | String | App logo URL (sidebar header) | `https://your-domain.com/logo.png` |

## Analytics (Optional)

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `VITE_ANALYTICS_ENDPOINT` | String | Analytics endpoint for tracking | `https://analytics.manus.im` |
| `VITE_ANALYTICS_WEBSITE_ID` | String | Analytics website ID (unique identifier) | `your_analytics_id_here` |

## Node Environment

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `NODE_ENV` | String | Environment mode: `development` or `production` | `development` |

---

## Setup Instructions

### For Local Development

1. **Copy the template:**
   ```bash
   cp .env.example .env
   ```

2. **Fill in the values** in `.env`:
   - `DATABASE_URL`: Your local MySQL/TiDB instance
   - `VITE_APP_ID`: Register an app at https://auth.manus.im
   - `JWT_SECRET`: Generate a random 32+ character string
   - `OWNER_OPEN_ID`: Your Manus OpenID
   - `BUILT_IN_FORGE_API_KEY`: Obtain from Manus account dashboard
   - Other values as needed

3. **Start the dev server:**
   ```bash
   pnpm dev
   ```

The dev server automatically loads variables from `.env`.

### For Production (Manus Hosting)

All environment variables are **automatically injected** by the Manus platform. You do **NOT** need to create a `.env` file.

**To manage production secrets:**
1. Go to Management UI → Settings → Secrets
2. Add or update environment variables
3. Changes take effect on next deployment

**Never commit `.env` to git.** Add it to `.gitignore` (already configured).

---

## Environment Variables Used in Code

### Server-Side (Node.js)
- `DATABASE_URL` - Database connection
- `JWT_SECRET` - Session cookie signing
- `VITE_APP_ID` - OAuth app ID
- `OAUTH_SERVER_URL` - OAuth backend
- `OWNER_OPEN_ID` - Owner identification
- `OWNER_NAME` - Owner display name
- `BUILT_IN_FORGE_API_URL` - Forge API endpoint
- `BUILT_IN_FORGE_API_KEY` - Forge API key
- `NODE_ENV` - Environment mode

### Client-Side (Browser)
- `VITE_APP_ID` - OAuth app ID
- `VITE_OAUTH_PORTAL_URL` - OAuth login portal
- `VITE_APP_TITLE` - App title
- `VITE_APP_LOGO` - App logo
- `VITE_FRONTEND_FORGE_API_KEY` - Forge API key
- `VITE_FRONTEND_FORGE_API_URL` - Forge API endpoint
- `VITE_ANALYTICS_ENDPOINT` - Analytics endpoint
- `VITE_ANALYTICS_WEBSITE_ID` - Analytics ID

---

## Security Notes

1. **Never commit `.env` to git** - Use `.gitignore`
2. **Keep `JWT_SECRET` private** - Generate a strong random string
3. **API keys are sensitive** - Treat like passwords
4. **Use HTTPS in production** - All API calls must be secure
5. **Rotate secrets regularly** - Change keys periodically
6. **Use environment-specific values** - Different secrets for dev/prod

---

## Troubleshooting

### "Cannot find module 'dotenv'"
- Run `pnpm install` to install dependencies

### "DATABASE_URL is not set"
- Check `.env` file exists in project root
- Verify `DATABASE_URL` is set and valid
- Restart dev server after changing `.env`

### "OAuth callback failed"
- Verify `VITE_APP_ID` is correct
- Check `VITE_OAUTH_PORTAL_URL` is accessible
- Ensure redirect URI matches OAuth app configuration

### "API key rejected"
- Verify `BUILT_IN_FORGE_API_KEY` is correct
- Check `BUILT_IN_FORGE_API_URL` is accessible
- Ensure API key has required permissions
