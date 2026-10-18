# OpenFind embedded acquisition engine

Source: https://github.com/laixi969-coder/openfind
Pinned commit: b98978dda3c5d51e2476646bde4349b050e6fcfa (retrieved 2026-10-17).
The repository owner requested integrating this engine into Harta. Upstream source and README are preserved here; the repository does not include a separate LICENSE file.

Harta adaptations:
- Playwright imports resolve to the existing playwright-core dependency; optional executable and headless configuration.
- OPENFIND_EMBEDDED suppresses upstream's fixed-port listener.
- platforms/client.ts dispatches to the same browser operations within the isolated worker instead of the standalone browser-service HTTP daemon.
- Login opens the visible official login control when needed; headless Douyin uses Playwright default launch arguments.
- loginPointer targets the same official page as the screenshot, allowing QR/login/challenge interaction inside Harta.
- Douyin search verifies the hydrated keyword before trusting the filter shell; empty exhausted searches reset response tracking before retrying.
- Harta only exposes allowlisted acquisition commands. Publishing, account credentials, provider configuration, and message sending are not proxied.

Each business runs in a separate child process with a separate SQLite database and Chrome profile. Native screenshots and login state stay scoped to the signed-in Harta user and selected business. Do not commit the runtime data directories.
