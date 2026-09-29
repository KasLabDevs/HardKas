# Production Deployment Checklist

## Environment
- [ ] Ensure `.env` is created based on `.env.example`.
- [ ] Run `hardkas env check` locally to validate variables.

## Security
- [ ] Do NOT commit `.env` or `.hardkas/keystore` to source control.
- [ ] Set appropriate restrictive permissions on the data directory.

## Observability
- [ ] Verify `/health` and `/metrics` endpoints are not publicly accessible if they contain sensitive data, or set up a reverse proxy.

## Data Persistence
- [ ] Ensure Docker volume `hardkas_data` is properly mapped and backed up.
- [ ] If using SQLite, ensure the database file resides within the persistent volume.
