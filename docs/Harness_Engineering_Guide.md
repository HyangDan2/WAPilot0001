# Harness Engineering Guide

## Purpose

This guide captures the deployment harness for WAPilot0001: the branch, runtime entrypoint, database requirements, deployment checks, and common failure modes for operating the FastAPI vocabulary trainer on Vercel with PostgreSQL.

## Deployment Target

- Hosting: Vercel
- Application runtime: Python FastAPI
- Production branch: `CDXDriven`
- Vercel entrypoint: `index.py`
- FastAPI app source: `main.py`
- Routing config: `vercel.json`
- Database: PostgreSQL through a managed provider such as Neon or Supabase

## Required Environment Variables

Set these in Vercel under Project Settings > Environment Variables.

| Name | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Preferred PostgreSQL connection string. |
| `POSTGRES_URL` | Alternative | Supported if the provider exposes this instead of `DATABASE_URL`. |
| `POSTGRES_URL_NON_POOLING` | Alternative | Supported for Neon/Vercel Marketplace style integrations. |
| `POSTGRES_PRISMA_URL` | Alternative | Supported as another provider-generated PostgreSQL URL. |
| `ADMIN_TOKEN` | Required for admin writes | Required to call protected server write endpoints. |

At least one PostgreSQL URL must be present in the active Vercel environment. For branch deployments, make sure the variable is enabled for Preview as well as Production.

## Vercel Configuration

`vercel.json` rewrites all routes to `index.py`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.py"
    }
  ]
}
```

`index.py` exports the FastAPI app:

```python
from main import app
```

Do not reintroduce a root-level `app.py`. This repository already uses `app/` as a Python package, so a root `app.py` shadows the package and breaks imports such as `app.models.schemas`.

## Data Ownership Model

The PostgreSQL database remains the canonical server dataset. Public users may read from it, but they must not mutate it.

Learning progress is local-first:

- Review status is stored in browser storage.
- Hidden words are stored in browser storage.
- Pack data may be cached locally by the browser.
- Public study actions do not write back to PostgreSQL.

Server writes are reserved for administrators and require the `x-admin-token` header matching `ADMIN_TOKEN`.

Public read endpoints:

- `GET /api/stats`
- `GET /api/words`
- `GET /api/words/{word_id}`
- `GET /api/due`
- `GET /api/quiz`
- `GET /api/packs`
- `GET /api/export`

Admin-only write endpoints:

- `POST /api/words`
- `DELETE /api/words/{word_id}`
- `PATCH /api/words/{word_id}/review`
- `POST /api/import/{pack_name}`
- `POST /api/reset`

Example admin request:

```bash
curl -X POST "https://<project>.vercel.app/api/import/n2_core_seed_060.json" \
  -H "x-admin-token: $ADMIN_TOKEN"
```

Never commit `ADMIN_TOKEN` or database URLs to Git. Store production values only in Vercel environment variables.

## Database Behavior

Local development falls back to the SQLite file `jppilot0002.db` when no PostgreSQL URL is set.

Vercel deployments must use PostgreSQL. The app intentionally refuses to fall back to SQLite on Vercel because serverless filesystems are not a reliable place for application data.

On startup, the app creates these tables if they do not already exist:

- `words`
- `study_logs`

Seed data is not imported automatically. After deployment, import JSON packs through the protected admin import endpoint.

## Deployment Flow

1. Commit changes on `CDXDriven`.
2. Push to GitHub:

```powershell
git push origin CDXDriven
```

3. In Vercel, confirm Project Settings > Git > Production Branch is set to `CDXDriven`.
4. Confirm PostgreSQL environment variables are enabled for the target environment.
5. Redeploy from Vercel Deployments, or push a new commit to trigger auto deployment.
6. Open the deployed URL and verify the dashboard loads.
7. Import a seed pack with the protected admin import endpoint.
8. Refresh and confirm stats/word data persist.

## Common Failures

### `ModuleNotFoundError: No module named 'app.models'; 'app' is not a package`

Cause: Vercel imported a root `app.py`, which shadowed the `app/` package.

Fix: Use `index.py` as the entrypoint and route to it from `vercel.json`. Ensure root `app.py` is absent.

### `unable to open database file`

Cause: Vercel fell back to SQLite because no PostgreSQL URL was visible to the function.

Fix: Add one of `DATABASE_URL`, `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, or `POSTGRES_PRISMA_URL` to the active Vercel environment and redeploy.

### `Vercel deployment requires a PostgreSQL URL`

Cause: The app detected it is running on Vercel, but none of the supported PostgreSQL URL variables were set.

Fix: Check whether the deployment is Production or Preview, then enable the database variable for that environment.

## Operational Checks

- Confirm `/` loads the main UI.
- Confirm `/api/stats` returns JSON.
- Import `n2_core_seed_060.json` from Packs.
- Confirm `/api/words?limit=10` returns rows after import.
- Confirm `POST /api/import/n2_core_seed_060.json` returns `403` without `x-admin-token`.
- Confirm `POST /api/reset` returns `403` without `x-admin-token`.

## Notes

- Existing local SQLite data is not migrated automatically.
- If local SQLite data must be preserved, create a dedicated SQLite-to-PostgreSQL migration script before replacing production data.
- Keep database secrets only in Vercel environment variables, not in committed files.
