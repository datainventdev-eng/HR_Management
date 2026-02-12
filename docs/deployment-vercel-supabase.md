# Deployment Notes (Vercel + Supabase)

## Frontend (Vercel)
1. Import repo to Vercel.
2. Set root to monorepo and configure build for `apps/web`.
3. Set `NEXT_PUBLIC_API_URL` to deployed API base URL.
4. Enable preview deployments for PR validation.

## Backend (NestJS)
- Deploy API in your chosen Node host (Vercel serverless functions or separate service).
- Ensure CORS allows frontend origin.
- Set JWT and Supabase env vars.

## Supabase
1. Create project.
2. Capture:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_DB_URL`
3. Configure daily backups and retention policy.
4. Restrict service role key access to backend runtime only.

## Rollback
- Keep last known good deployment in Vercel.
- Revert main branch to prior stable commit if critical issue appears.
- Restore DB from latest backup only for severe data corruption scenarios.
