# LIFE RPG — Handoff

## Operational summary

LIFE RPG is a local-first, single-user application. It runs on `127.0.0.1:3000`
and stores all data under the configured data directory
(`%LOCALAPPDATA%\LIFE_RPG_WEB` by default on Windows).

## Starting the application

### Development (Windows PowerShell)
```powershell
.\start-dev.ps1
```
Starts API server on `http://127.0.0.1:3000` and Vite dev server on
`http://127.0.0.1:5173`.

### Production (Windows PowerShell)
```powershell
.\start-prod.ps1
```
Builds and starts the production server on `http://127.0.0.1:3000`.

### Docker
```bash
docker compose up -d
```
Published on `http://127.0.0.1:3000`. Data persisted in the `liferpg-data`
volume.

## Data directory

Default locations:
- Windows: `%LOCALAPPDATA%\LIFE_RPG_WEB`
- Linux/macOS: `~/.local/share/LIFE_RPG_WEB`

Override with `LIFERPG_DATA_DIR` environment variable.

Contents:
- `database/liferpg.db` — SQLite database (source of truth)
- `backups/` — ZIP archives (manual + automatic safety snapshots)
- `settings/secret.key` — AES-256-GCM key for encrypted API keys
- `storage/` — attachments (inventory, journal, activity, character)

## Backup and restore

### Creating a backup
Settings → Backups & Data → Create backup. Produces a ZIP archive in the
`backups/` folder with a manifest, the database, settings, and attachments.

### Validating a backup
Settings → Backups & Data → Validate on a backup entry. Verifies checksums and
database integrity.

### Restoring a backup
Settings → Backups & Data → Restore on a backup entry. Before restoring, the
system creates an automatic pre-restore safety snapshot (also listed in the
backup catalog). The restore re-indexes the catalog after swapping databases.

### Backup portability
Backup ZIP files are ordinary archives. To move data to another machine:
1. Copy the ZIP backup to the new machine
2. Install LIFE RPG on the new machine
3. Use Settings → Backups & Data → Restore to restore from the copied ZIP
4. Reconfigure AI providers (API keys are encrypted with a machine-specific key;
   they must be re-entered on the new machine)

## AI credential recovery

API keys are encrypted at rest with AES-256-GCM. The encryption key is stored
in `settings/secret.key`. If this key is lost, encrypted API keys cannot be
decrypted and must be re-entered in Settings → AI Providers.

To migrate AI credentials to another machine:
1. Back up the database and `settings/secret.key` together
2. Restore both on the new machine
3. API keys will decrypt correctly with the restored key

## Security notes

- The server binds to `127.0.0.1` by default. Never set `HOST=0.0.0.0`.
- Docker publishes `127.0.0.1:3000:3000` (localhost-only).
- `LIFERPG_ALLOW_REMOTE_HOSTS` is a comma-separated allowlist. Do not add
  public interfaces or `0.0.0.0`.
- Host-header and Origin protections reject non-loopback requests by default.
- No telemetry, no cloud, no external dependencies unless AI providers are
  explicitly configured.

## Support

No external support — the application is designed to be fully self-hosted and
self-contained. All code and configuration is in this repository.
