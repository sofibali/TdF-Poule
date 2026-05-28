-- Force PostgREST (Supabase's REST API layer) to reload its schema cache.
-- Without this, newly-added functions like upsert_riders_bulk can return
-- "Could not find the function in the schema cache" errors for up to a
-- few minutes after creating them.
notify pgrst, 'reload schema';
