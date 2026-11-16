# Mr Orinda | Training portfolio

A private, mobile-first training portfolio built with Next.js App Router, MySQL/Prisma, and persistent VPS file storage. It presents Mr. Orinda's biography, portrait, and publishable training assignments in the established typography and colour theme.

Academic PDFs, certificates, CV files, and professional-document downloads are intentionally not part of this repository.

## How access works

There are two independent, stable bearer links:

- **Supervisor:** exchanges its token for an HttpOnly supervisor session, then redirects to `/portfolio`. It can see only current published snapshots and their files.
- **Management:** exchanges its token for an HttpOnly management session, then redirects to `/manage`. It can create, edit, upload, order, publish, unpublish, and delete assignments.

The raw token appears only in the initial entry URL. The server stores an HMAC-SHA-256 hash, not the token. Sessions record the credential version, so rotating either credential invalidates only sessions issued from that credential. Management and supervisor use separate role-specific session cookies, so both can coexist in one browser. Cookies use `SameSite=Lax` so a full bearer link opened as a top-level navigation from email or messaging can complete its session exchange; management mutations still require a matching role-specific CSRF cookie/header pair and the canonical origin. GET routes do not perform management mutations.

After a published assignment is edited, supervisors continue to see the previous immutable published revision. Publishing promotes the fully stored working revision in one database transaction and creates a new private working revision. This avoids partial/failed uploads becoming visible.

## Local development

Requirements: Node.js 22 or newer, npm, and MySQL 8.0 or newer.

1. Copy `.env.example` to `.env` and replace every placeholder. Generate `TOKEN_HASH_KEY` with at least 32 random bytes, for example `openssl rand -base64 48`.
2. Create the MySQL database and an application user (example SQL below).
3. Run `npm install`.
4. Apply migrations with `npm run db:migrate` (or `npm run db:migrate:dev` only for migration development).
5. Provision links:

   ```sh
   npm run access -- provision management
   npm run access -- provision supervisor
   ```

   Each plaintext link is printed once. Store the management link in a password manager. Put the full supervisor link in the server-only `SUPERVISOR_SHARE_URL` value so the management screen can copy it. Never place either in a client-prefixed environment variable.

6. Start with `npm run dev`.

Useful checks are `npm run lint`, `npm test`, `npm run test:browser`, and `npm run build`. Browser tests use installed Edge on Windows or Playwright Chromium elsewhere; set `PLAYWRIGHT_WEBKIT=1` to include WebKit when that browser bundle is installed.

### MySQL setup example

Run as a MySQL administrator and use a unique password in production:

```sql
CREATE DATABASE orinda_portfolio CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'orinda'@'127.0.0.1' IDENTIFIED BY 'replace-with-a-long-password';
GRANT ALL PRIVILEGES ON orinda_portfolio.* TO 'orinda'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Dates are stored as UTC `DATETIME(3)` values. The server, MySQL connection, and backups should use UTC. The interface formats dates explicitly as **Africa/Nairobi** and labels them accordingly.

## Assignment and storage model

`Assignment` owns a current working `Revision` and optionally a current published `Revision`. Each revision owns ordered attachment rows. Publishing validates a non-empty title plus at least one successfully committed attachment, atomically switches the published pointer, retires the former snapshot, and clones the published metadata into a new private draft.

Uploads are streamed to a temporary file with configured byte limits, detected from actual file signatures, and then moved to generated storage names. Allowed types are JPEG, PNG, WebP, and PDF. Image thumbnails are decoded with pixel limits, auto-oriented, resized, and written as WebP. Original filenames are metadata only and never become paths. Every original/thumbnail response passes through a session/role check and sends `nosniff`, private/no-store caching, an accurate content type, and a safe `Content-Disposition` value.

Limits are controlled by `MAX_FILE_BYTES`, `MAX_FILES_PER_ASSIGNMENT`, and `MAX_UPLOAD_REQUEST_BYTES`. Set the Nginx `client_max_body_size` slightly above the app’s per-request limit. Each upload request carries one file, enabling real progress and bounded streaming. Client upload IDs make an explicit retry idempotent. Failed temporary files are removed; `npm run storage:cleanup` removes stale `.tmp` and unreferenced generated files. Run cleanup from a low-traffic scheduled job after database/file backups.

Do not put `UPLOAD_DIR` inside the repository or `public/`. The service account needs read/write/traverse access only to that directory, for example:

```sh
sudo install -d -o orinda-portfolio -g orinda-portfolio -m 0750 /var/lib/orinda-portfolio/uploads
```

## VPS deployment

The examples assume Ubuntu, Node.js 22+, MySQL 8+, Nginx, and systemd.

1. Create a locked-down `orinda-portfolio` service account, `/opt/orinda-portfolio/releases`, `/opt/orinda-portfolio/current`, and the persistent upload directory above.
2. Clone this repository into a timestamped release directory. Create `/etc/orinda-portfolio.env` (mode `0600`, owned by root) from `.env.example`; use real database and cryptographic secrets there. `UPLOAD_DIR` must remain `/var/lib/orinda-portfolio/uploads` across releases.
   Set the canonical public origin exactly (with no path, query string, or fragment):

   ```sh
   NEXT_PUBLIC_SITE_URL="https://orinda-training.scholaroscope.com"
   ```

   `NEXT_PUBLIC_SITE_URL` is included in the production build. Changing it requires running `npm run build` again and restarting the service.
3. In the release, run `npm ci`, `npm run db:migrate`, and `npm run build`. Provision initial access only once after the first migration.
4. Atomically point `/opt/orinda-portfolio/current` at the new release. Install `deploy/orinda-portfolio.service` as `/etc/systemd/system/orinda-portfolio.service`, then run `sudo systemctl daemon-reload`, `sudo systemctl enable --now orinda-portfolio`.
5. Adapt `deploy/nginx.conf.example`. Define the shown `combined_no_args` log format in the `http` block so query strings containing entry tokens never reach access logs. Also ensure upstream/CDN/APM tracing and error pages do not record query strings. Obtain and renew HTTPS certificates with Certbot. Cookies are `Secure` in production, so do not serve production over HTTP.
6. Verify headers, access exchange, upload limits/timeouts, supervisor visibility, file download authorization, and mobile layout through the public HTTPS hostname.

For an update, build and migrate a new release, switch the `current` symlink, and restart the service. Migrations must be backward-compatible during the brief switch. Never replace the upload directory or production environment file. Retain the previous release for rollback; database migrations may require a coordinated database restore instead of only changing the symlink.

### Backups and restore

Back up the MySQL database and upload directory in the same maintenance window or from a filesystem/database snapshot. A practical sequence is: briefly stop writes (stop the service), take `mysqldump --single-transaction --routines --triggers orinda_portfolio`, archive `/var/lib/orinda-portfolio/uploads` preserving ownership/modes, then restart. Encrypt backups and test restores.

To restore, stop the service, restore the database and the matching upload archive together, correct ownership to `orinda-portfolio`, run the migrations corresponding to the checked-out release if appropriate, and start the service. Restoring only one side can leave missing or unreferenced files; run the cleanup command only after verifying the coordinated restore.

### Token and session operations

Rotate links independently:

```sh
npm run access -- rotate management
npm run access -- rotate supervisor
```

Rotation increments that credential’s version and deletes its sessions immediately. Update `SUPERVISOR_SHARE_URL` and restart the service after supervisor rotation. Share new links out of band. Never paste links into tickets, shell history shared with others, analytics, or screenshots. Expired sessions remain harmless and may be removed periodically with SQL (`DELETE FROM Session WHERE expiresAt < UTC_TIMESTAMP(3)`).

## Security and privacy notes

- All private pages and APIs are dynamic and send private/no-store headers. `robots.txt`, metadata, and `X-Robots-Tag` deny indexing/following; `Referrer-Policy` is `no-referrer`.
- Biography and assignment data are rendered only after server-side session checks. Attachment IDs are not access credentials.
- Descriptions, titles, and filenames are rendered as React text, never raw HTML.
- `SUPERVISOR_SHARE_URL`, `DATABASE_URL`, `TOKEN_HASH_KEY`, access links, runtime uploads, and `.env` files must never be committed.
- The entry exchange necessarily uses a GET because a human opens the credential link; its only effect is creating a session. All assignment mutations are non-GET and CSRF-protected.
- A copied clean portfolio or file URL is unusable without the corresponding authorised session.

## Repository layout

- `src/app` — App Router pages and authorised route handlers
- `src/lib` — session policy, revisions, persistence, storage, and validation
- `prisma` — MySQL schema and deployable migrations
- `scripts` — credential provisioning/rotation and storage cleanup
- `deploy` — systemd and Nginx examples
- `tests` — focused security/domain tests

No deployment or real credentials are included in this repository.
