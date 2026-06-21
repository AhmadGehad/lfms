# LFMS Environment Variables

This document lists all environment variables required for the Livestock Farm Management System (LFMS), with real credentials and setup instructions.

## Quick Start

### For Local Development with Real Credentials

```bash
# Copy the provided .env.local file to .env
cp .env.local .env

# Install dependencies
pnpm install

# Start dev server (loads .env automatically)
pnpm dev
```

The dev server will now connect to the real TiDB database and use actual Manus OAuth credentials.

---

## Environment Variables Reference

### Database

| Variable | Type | Value | Notes |
|----------|------|-------|-------|
| `DATABASE_URL` | String | `mysql://2Miqjapjuirru1Z.b9867fc13f8f:UnYrG0OIJE8zm6or9J26@gateway06.us-east-1.prod.aws.tidbcloud.com:4000/boyWMBM5odtbpptCLrtK7n?ssl={"rejectUnauthorized":true}` | TiDB Cloud with SSL enabled |

**SSL Configuration Details:**
- TiDB Cloud requires SSL connections
- The `ssl` parameter is JSON-encoded in the connection string
- `rejectUnauthorized: true` enforces certificate validation
- The `mysql2` driver automatically parses this format
- SSL is mandatory; connections without SSL will fail

### Authentication & OAuth

| Variable | Type | Value |
|----------|------|-------|
| `VITE_APP_ID` | String | `boyWMBM5odtbpptCLrtK7n` |
| `OAUTH_SERVER_URL` | String | `https://api.manus.im` |
| `VITE_OAUTH_PORTAL_URL` | String | `https://manus.im` |
| `JWT_SECRET` | String | `mQkoFosioP6xNb6TmMBJ3Q` |

**OAuth Flow:**
1. User clicks "Sign In" → redirects to `VITE_OAUTH_PORTAL_URL`
2. User authenticates with Manus account
3. OAuth server redirects to `/api/oauth/callback` with auth code
4. Backend exchanges code for JWT token
5. JWT stored in `__Host-lfms_session` cookie (HttpOnly, Secure, SameSite=Lax)
6. Subsequent requests include session cookie for authentication

### Owner Information

| Variable | Type | Value |
|----------|------|-------|
| `OWNER_OPEN_ID` | String | `BzE3sWMQNrS6fiC3R725Cv` |
| `OWNER_NAME` | String | `Ahmed Gehad` |

**Purpose:**
- `OWNER_OPEN_ID`: Unique identifier from Manus OAuth (used to identify the farm owner)
- `OWNER_NAME`: Display name shown in the UI

### Built-In Forge API (Manus Platform Services)

| Variable | Type | Value |
|----------|------|-------|
| `BUILT_IN_FORGE_API_URL` | String | `https://forge.manus.ai` |
| `BUILT_IN_FORGE_API_KEY` | String | `ZW537HbPuAWx7Y59vq6zGm` |
| `VITE_FRONTEND_FORGE_API_KEY` | String | `ZFV5NP7CQ4FwhESDj3f7hH` |
| `VITE_FRONTEND_FORGE_API_URL` | String | `https://forge.manus.ai` |

**Purpose:**
- Provides access to Manus platform services:
  - LLM (language models for AI features)
  - File storage (S3-compatible)
  - Notifications (email, SMS, push)
  - Analytics
  - Data APIs

**Key Differences:**
- `BUILT_IN_FORGE_API_KEY`: Server-side only (backend calls)
- `VITE_FRONTEND_FORGE_API_KEY`: Client-side (browser calls)
- Both keys have different permissions and rate limits

### Application Branding

| Variable | Type | Value |
|----------|------|-------|
| `VITE_APP_TITLE` | String | `Livestock Farm Management System` |
| `VITE_APP_LOGO` | String | `https://files.manuscdn.com/user_upload_by_module/web_dev_logo/310519663117215873/CDevQYVNVVcAGtjY.png` |

**Purpose:**
- `VITE_APP_TITLE`: Displayed in browser tab title and sidebar header
- `VITE_APP_LOGO`: Logo image URL shown in sidebar

### Analytics

| Variable | Type | Value |
|----------|------|-------|
| `VITE_ANALYTICS_ENDPOINT` | String | `https://manus-analytics.com` |
| `VITE_ANALYTICS_WEBSITE_ID` | String | `bf590fe0-14be-4864-87a8-b684033fa34b` |

**Purpose:**
- Tracks page views, user events, and performance metrics
- Used for analytics dashboard and monitoring

### Node Environment

| Variable | Type | Value |
|----------|------|-------|
| `NODE_ENV` | String | `development` (local) or `production` (deployed) |

---

## Setup Instructions

### Option 1: Local Development with Real Credentials (Recommended)

This setup connects to the real TiDB database and Manus services:

```bash
# 1. Copy the provided credentials file
cp .env.local .env

# 2. Verify .env is in .gitignore (already configured)
grep "^\.env$" .gitignore

# 3. Install dependencies
pnpm install

# 4. Start dev server
pnpm dev

# 5. Open browser to http://localhost:3000
# 6. Click "Sign In" and authenticate with your Manus account
```

**What you can test:**
- ✅ Full OAuth login flow
- ✅ Real database connection
- ✅ All features with production data
- ✅ Manus platform services (LLM, storage, notifications)
- ✅ Analytics tracking

### Option 2: Local Development with Placeholder Credentials

For testing without connecting to production:

```bash
# 1. Copy the template
cp .env.example .env

# 2. Fill in placeholder values (see ENV_VARIABLES.md for examples)
# 3. For DATABASE_URL, use a local MySQL instance:
#    DATABASE_URL=mysql://root:password@localhost:3306/lfms
# 4. For OAuth, register a test app at https://auth.manus.im

# 5. Start dev server
pnpm dev
```

**Limitations:**
- ❌ Cannot test OAuth login (requires registered app)
- ❌ Cannot connect to production database
- ❌ Manus services unavailable

### Option 3: Production (Manus Hosting)

**Do NOT create a `.env` file for production.**

All environment variables are automatically injected by the Manus platform:

1. Go to **Management UI** → **Settings** → **Secrets**
2. View all injected environment variables
3. To update a variable:
   - Click **Edit**
   - Change the value
   - Click **Save**
   - Changes take effect on next deployment

---

## Troubleshooting

### Database Connection Error: "Unknown column 'vaccination_records.notifybeforenext'"

**Cause:** Schema mismatch between code and database. The migration hasn't been applied.

**Solution:**
```bash
# Apply pending migrations
pnpm db:push

# Or manually run migration
pnpm drizzle-kit migrate
```

### Database Connection Error: "SSL: CERTIFICATE_VERIFY_FAILED"

**Cause:** TiDB requires SSL but certificate validation failed.

**Solution:**
```bash
# Verify DATABASE_URL includes ssl parameter:
# DATABASE_URL=mysql://user:pass@host:4000/db?ssl={"rejectUnauthorized":true}

# If using local MySQL (no SSL):
# DATABASE_URL=mysql://root:password@localhost:3306/lfms
```

### OAuth Login Fails: "Invalid app ID"

**Cause:** `VITE_APP_ID` is incorrect or not registered.

**Solution:**
1. Verify `VITE_APP_ID` in `.env` matches the registered app
2. Check `VITE_OAUTH_PORTAL_URL` is accessible
3. Ensure OAuth app allows `http://localhost:3000/api/oauth/callback` as redirect URI

### "Cannot find module 'dotenv'"

**Cause:** Dependencies not installed.

**Solution:**
```bash
pnpm install
```

### Dev server runs but UI shows "Unauthorized"

**Cause:** Session cookie not set (OAuth login failed).

**Solution:**
1. Check browser console for errors
2. Verify OAuth credentials in `.env`
3. Clear cookies and try login again
4. Check dev server logs for OAuth errors

### API calls fail with "401 Unauthorized"

**Cause:** Session expired or invalid.

**Solution:**
1. Log out and log back in
2. Check `__Host-lfms_session` cookie exists in DevTools
3. Verify JWT_SECRET hasn't changed

---

## Security Notes

### ⚠️ Critical

1. **Never commit `.env` to git** - Already in `.gitignore`, but verify:
   ```bash
   git status .env
   # Should show: "new file: .env" (not tracked)
   ```

2. **Keep credentials private** - These are production credentials:
   - Database password: `UnYrG0OIJE8zm6or9J26`
   - API keys: `ZW537HbPuAWx7Y59vq6zGm`, `ZFV5NP7CQ4FwhESDj3f7hH`
   - JWT secret: `mQkoFosioP6xNb6TmMBJ3Q`

3. **Rotate credentials if compromised:**
   ```bash
   # 1. Go to Manus dashboard
   # 2. Regenerate API keys
   # 3. Update .env.local
   # 4. Restart dev server
   # 5. Redeploy to production
   ```

4. **Use HTTPS in production** - All API calls must be secure

5. **Never share `.env` files** - Even with team members; use secure credential management

---

## Environment Variables Used in Code

### Server-Side (Node.js)
Located in `server/_core/env.ts`:
- `DATABASE_URL` - Database connection
- `JWT_SECRET` - Session cookie signing
- `VITE_APP_ID` - OAuth app ID
- `OAUTH_SERVER_URL` - OAuth backend
- `OWNER_OPEN_ID` - Owner identification
- `OWNER_NAME` - Owner display name
- `BUILT_IN_FORGE_API_URL` - Forge API endpoint
- `BUILT_IN_FORGE_API_KEY` - Forge API key (server-side)
- `NODE_ENV` - Environment mode

### Client-Side (Browser)
Accessed via `import.meta.env`:
- `VITE_APP_ID` - OAuth app ID
- `VITE_OAUTH_PORTAL_URL` - OAuth login portal
- `VITE_APP_TITLE` - App title
- `VITE_APP_LOGO` - App logo
- `VITE_FRONTEND_FORGE_API_KEY` - Forge API key (client-side)
- `VITE_FRONTEND_FORGE_API_URL` - Forge API endpoint
- `VITE_ANALYTICS_ENDPOINT` - Analytics endpoint
- `VITE_ANALYTICS_WEBSITE_ID` - Analytics ID

---

## Files Provided

1. **`.env.local`** - Real credentials for local development
   - Copy to `.env` to use
   - Contains production database and API keys
   - Never commit to git

2. **`ENV_VARIABLES.md`** - This file
   - Complete reference with descriptions
   - Setup instructions
   - Troubleshooting guide

3. **`.env.example`** - Template with placeholders
   - Use for documentation
   - Copy and fill in values for custom setup
