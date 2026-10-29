# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub: **Security → Report a
vulnerability** on this repository. Do not open a public issue. You should get a reply
within 7 days.

## Scope and practices

- The milestone 1 site is static; bots run in the browser and no user data is collected.
  The only browser storage is a local win/loss record, kept in `localStorage` on your device.
- Milestone 2 (online play) will validate every client message with strict zod schemas
  (`packages/protocol`), rate-limit moves per connection, and run the server as a non-root
  user in its container.
- No secrets are committed: `.env.example` lists variable names only, and CI secrets live in
  GitHub's encrypted secrets.
- Dependencies are updated weekly by Dependabot and checked by CI.
