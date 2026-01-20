# identity_service

Local identity store (profiles + enrollments + memory) backed by SQLite.

## Run

```bash
cd identity_service
npm run dev
```

- UI (serves `../identity_prototype/`): `http://localhost:5176`
- API:
  - `GET /api/healthz`
  - `GET /api/profiles`
  - `POST /api/profiles`
  - `GET /api/profiles/:profile_id`
  - `DELETE /api/profiles/:profile_id`
  - `POST /api/profiles/:profile_id/enroll`
  - `PATCH /api/profiles/:profile_id/memory`
  - `POST /api/profiles/:profile_id/conversations`
  - `GET /api/profiles/:profile_id/images`
  - `POST /api/profiles/:profile_id/images`

## Storage

- SQLite file: `../data/identity.db`

