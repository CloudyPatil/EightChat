# EightChat

EightChat is a mobile-first direct messaging app. The first release uses a
username and password only—no phone, email, or OTP is required.

## Local development

Requirements: Node.js 22+, pnpm 11+, and Docker Desktop.

```sh
pnpm install
pnpm docker:up
pnpm dev:server
```

The API starts at `http://localhost:3000`; its health check is available at
`GET /health`.

Current authentication endpoints:

- `POST /api/auth/register` with `username` and `password`
- `POST /api/auth/login` with `username` and `password`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

Usernames use 3-30 lowercase letters, numbers, or underscores. Passwords must
be 8-128 characters.

Docker starts only the services currently needed for the MVP:

- PostgreSQL on port 5432
- Redis on port 6379

Copy `.env.example` to `.env` when setting up a new machine, and replace the
development JWT secrets before deployment.
