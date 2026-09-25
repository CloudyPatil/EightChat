# EightChat first public rollout (up to 10 users)

This is a mobile app plus a public API. The first free-tier deployment uses
Render Free for the API, Neon PostgreSQL, Upstash Redis, Cloudinary for images,
Expo EAS for installable builds, and Firebase for Android push credentials.
Check each provider's current limits before creating resources.

The app is **not live** until the services, secrets, push credentials, and mobile
build below are configured and tested on a physical phone. Never commit real
credentials, paste them into chat, or put them in `EXPO_PUBLIC_*` variables.

## 1. Create accounts and resources

1. Create accounts at [Render](https://render.com/), [Neon](https://neon.tech/),
   [Upstash](https://upstash.com/), [Cloudinary](https://cloudinary.com/), and
   [Expo](https://expo.dev/). Sign in to [Firebase](https://console.firebase.google.com/)
   with a Google account. Enable account security and usage alerts.
2. Create a Neon project/database. Save the **direct** PostgreSQL connection
   details (host, port, database, user, password). Keep TLS enabled.
3. Create an Upstash Redis database. Save its TLS `rediss://` ioredis URL.
4. Create a Cloudinary account/product environment. Save `CLOUDINARY_URL`.
5. On Expo, create an EAS project. Configure Android FCM V1 credentials for
   remote push notifications. iOS additionally needs Apple developer
   credentials and APNs; an Android APK does not install on iPhones.

## 2. Deploy the API

1. Push the verified deployment changes to the GitHub repository. Render only
   sees committed code, not local uncommitted files.
2. In Render, create a new **Blueprint** from this repository's `render.yaml`.
   It declares one Docker **Web Service** on the `free` plan in Singapore. Do
   not create Render Postgres or Key Value: use Neon and Upstash instead.
3. During Blueprint creation, enter Neon direct connection fields,
   Upstash's TLS `rediss://` URL, and `CLOUDINARY_URL` in the prompted secret
   fields. `render.yaml` generates separate JWT secrets. Never commit secrets.
4. Check the deploy logs. The app runs database migrations on startup. Confirm
   `https://<your-render-service>.onrender.com/ready` returns
   `{ "status": "ready" }`.

Render Free spins down after 15 minutes without inbound traffic. Waking on the
next request may take about a minute, so this $0 rollout cannot promise
instant 24/7 chat. It has no persistent local disk or high-availability SLA.
Keep database exports/backups off the Render service and test restoration.
Images uploaded to Cloudinary remain there until separately deleted under
your retention policy.

## 3. Build the mobile app

Install [EAS CLI](https://docs.expo.dev/build/setup/) and sign in with
`eas login`. From `apps/mobile`:

1. Run `eas init` to link the app and record the real EAS project ID in
   `app.json` under `expo.extra.eas.projectId` (the command may do this).
2. Set `EXPO_PUBLIC_API_URL` in the EAS **production** environment to
   `https://<your-render-service>.onrender.com/api`. This is a public address, not a secret.
   Both the `preview` and `production` build profiles use that environment.
3. Create a Firebase project, register the Android package from `app.json`,
   and configure Android FCM V1 push credentials in EAS. Grant notification
   permission on a physical phone when testing. Expo Go is not the release app.
4. Run `eas build --platform android --profile preview`. This creates an APK
   install link for the first Android users. The `production` profile creates
   an AAB for Google Play and is **not** directly installable from a link.
5. If iPhone users are required, arrange Apple developer membership, APNs,
   device provisioning/App Store distribution, then build for iOS separately.

A release app refuses to start with an absent/non-HTTPS API URL, so it cannot
silently point at the local Android emulator address. If the API address is
changed later, rebuild the app (or set up a stable custom API domain first).

## 4. Test before sharing

- On two physical phones and different networks, register, log in, send and
  receive text, test realtime reconnect after backgrounding, and upload images.
- Confirm clear chat, delete for me, and delete for everyone on both phones.
- Test notification enable/disable and hidden previews while the app is closed.
  Check push receipts/errors in API logs if delivery fails.
- Check duplicate usernames, incorrect passwords, token expiry/relogin,
  blocked users, and account deletion. Review API logs without recording
  passwords or tokens.
- Take and restore a database backup in a non-production test database.

The current registration endpoint is open to anyone who obtains the APK and
API address; **"10 users" is a size estimate, not an enforced account cap**.
If access must be restricted to ten approved people, add invite control before
sharing the install link. A publicly reachable API also needs ongoing log,
cost, abuse, and backup monitoring. Do not treat this small rollout as an
audited high-availability or end-to-end-encrypted messenger.
