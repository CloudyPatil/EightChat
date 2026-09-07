# Production checklist

1. Deploy the API image from the root `Dockerfile` behind HTTPS at a public domain.
2. Use managed PostgreSQL and Redis; set every value in `.env.production` from the example.
3. Run database migrations during deployment, then check `GET /ready`.
4. Replace local `server/uploads` storage with private object storage (S3/R2/MinIO) before scaling beyond one API instance.
5. Create an Expo project, set `EXPO_PUBLIC_EAS_PROJECT_ID`, configure FCM (Android) and APNs (iOS), then make EAS development/release builds.
6. Keep “Hide message previews” on by default. Each device can turn push notifications off or change that preference in Settings.
7. Add monitoring, backups, rate-limit storage shared through Redis, and a Socket.IO Redis adapter before running multiple API instances.
