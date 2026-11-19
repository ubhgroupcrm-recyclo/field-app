# Supabase Edge Functions

Deploy the administrator-only PIN reset function after linking this folder to the project:

```powershell
supabase functions deploy reset-user-pin
supabase functions deploy create-project-user
```

The function uses Supabase-managed environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`). Do not add the service-role key to the browser application or to a Vite environment file.
