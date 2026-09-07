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

## Mobile app

The Expo app is in `apps/mobile`. Copy `apps/mobile/.env.example` to
`apps/mobile/.env` and set the API address for the device or emulator you are
using, then run `pnpm dev:mobile`.

The current mobile flow supports account registration/login, username search,
direct-conversation creation, paginated message history, realtime text messages,
typing indicators, and logout.

Current authentication endpoints:

- `POST /api/auth/register` with `username` and `password`
- `POST /api/auth/login` with `username` and `password`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

Usernames use 3-30 lowercase letters, numbers, or underscores. Passwords must
be 8-128 characters.

Current conversation endpoints (all require `Authorization: Bearer <access token>`):

- `GET /api/users?query=ab` searches usernames.
- `POST /api/conversations/direct` with `recipient_username` creates or returns a direct conversation.
- `GET /api/conversations` lists the current user's direct conversations.
- `GET /api/conversations/:id` returns a conversation only to its members.

Message history endpoint (requires an access token):

- `GET /api/conversations/:conversationId/messages?before=<ISO date>&limit=50`
- `DELETE /api/conversations/messages/:messageId` with `{ "scope": "me" | "everyone" }`
- `DELETE /api/conversations/:conversationId/messages` clears the caller's chat history only.

Realtime Socket.IO events authenticate with `auth: { token: <access token> }`:

- Client → server: `message:send`, `typing:update`, `conversation:join`
- Server → client: `message:new`, `typing:update`, `presence:update`

Text messages are stored as plain text for the MVP. End-to-end encryption is not
implemented yet.

See [PRODUCTION.md](PRODUCTION.md) before deploying a public version.

Docker starts only the services currently needed for the MVP:

- PostgreSQL on port 5432
- Redis on port 6379

Copy `.env.example` to `.env` when setting up a new machine, and replace the
development JWT secrets before deployment.
