# LIFE RPG — AI System

## Design principles

- **AI is optional.** The app is fully functional with the offline heuristic.
- **AI never writes progression.** The model only suggests; the domain validation
  gate enforces all invariants; the user must approve before anything is persisted.
- **No data leaves the machine unless the user configures a provider.** Only
  activity text and taxonomy names/IDs are sent to the AI provider — never
  inventory documents, journal entries, credentials, or personal data.
- **Heuristic fallback** is always available when AI is disabled, unavailable, or
  declined.

## Providers

Two provider kinds are supported:

| Kind | Endpoint | Auth |
|------|----------|------|
| Ollama | `http://localhost:11434/api/chat` | None (local) |
| OpenAI-compatible | Any `POST /chat/completions` | Bearer API key |

### Credential security

- API keys are encrypted at rest with AES-256-GCM.
- The encryption key is stored in `settings/secret.key` (created on first use).
- The settings UI masks API keys (shows only whether a key is present).
- Keys are decrypted in memory only at request time and never logged.

### Consent

Each provider has an `external_consent_at` timestamp. Consent must be recorded
before the provider is used for AI analysis. This is opt-in per provider.

## Analysis flow

```
1. User submits activity text
2. Heuristic analysis runs immediately (offline, deterministic)
3. If AI enabled + consented: AI provider also produces a suggestion
4. validateAnalysis() gate:
   - Resolves allocation targets against the taxonomy
   - Clamps values to safe ranges
   - Enforces WPF parity: attribute XP = 2 × player XP
   - Returns ok/errors/warnings + normalized analysis
5. User reviews the proposal in the "Review proposal" dialog
6. User clicks "Approve & record"
7. Server applies the award (diminishing + spillover + ledger)
```

## System prompt (AI)

The AI is instructed to:

- Return only a JSON object
- Use only IDs from the provided taxonomy
- Allocate attribute XP equal to twice the player XP by design
- Never invent IDs or values — the server validates and applies

## AI never writes progression

The server-side `validateAnalysis()` function is the trust boundary:

1. Allocation targets are resolved against the taxonomy — unknown IDs are rejected
2. XP values are clamped to `[1, 100000]` per allocation
3. Total attribute XP is scaled to equal `2 × playerXp` (WPF parity)
4. Diminishing multiplier is applied at activity creation time
5. The user must click "Approve & record" in the UI before anything is written

## Configuration

AI providers are managed in Settings → AI Providers:

- Add provider (name, kind, endpoint, model, API key)
- Set default provider
- Enable/disable provider
- Record external consent
- Delete provider

When no provider is configured or all are disabled, the heuristic is used
exclusively.
