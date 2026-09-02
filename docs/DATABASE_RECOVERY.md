# Database backup, recovery, and migration procedure

## Backup policy

Production requires automatic Supabase daily backups. Before every production
migration, record the latest successful backup timestamp and verify the project
retention setting. Point-in-Time Recovery is deferred until separately approved.

Portraits are processed transiently and are not stored by TejAI, so database
backup evidence must never contain image blobs or retained image URLs.

## Restore rehearsal

Use synthetic staging data only:

1. Create an isolated temporary database or project.
2. Restore a staging backup or logical dump containing synthetic accounts.
3. Apply any later migrations in timestamp order.
4. Verify expected tables, indexes, constraints, and functions.
5. Verify RLS is enabled and forced on server-owned tables.
6. Verify `anon` and `authenticated` cannot read operational, billing, privacy,
   quota, or provider-usage tables or execute trusted RPCs.
7. Verify the service role can call `ops_readiness_probe` and retrieve the
   identity-free usage summary.
8. Record row counts and migration identifiers, not record contents.
9. Delete the isolated rehearsal environment after evidence is approved.

Do not copy production user data to a workstation or unmanaged test project.

## Migration failure

1. Stop further migration execution.
2. Disable billing and scan mutations if schema compatibility is uncertain.
3. Preserve the migration error without credentials or row contents.
4. Prefer a reviewed forward-fix migration.
5. Do not restore browser privileges removed by Day 11.
6. Do not drop privacy audit/tombstone data or provider usage records to make a
   rollback appear successful.
7. Restore from backup only when a forward repair cannot safely preserve data.

Database recovery and application rollback are separate decisions. A previous
application release may be restored only when it remains compatible with the
current schema.
