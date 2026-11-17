# Sage

Sage is a personal health assistant for people who want to lose weight but gave up on calorie
apps because logging was tedious. Show it a photo of your plate, or say what you ate; an AI
estimates the foods, portions, calories and protein, asks at most one question about what a
photo cannot show (oil, ghee, sugar), and saves the meal once you confirm. A "Today" view shows
target, eaten, left and protein. There is no login: each device has an anonymous id.

This repository is an npm-workspaces monorepo (TypeScript, Node 22).

| Path              | What it is                                                                  |
| ----------------- | --------------------------------------------------------------------------- |
| `packages/shared` | The API contract (zod schemas and inferred types) and pure domain functions |
| `apps/api`        | HTTP API: Fastify, Prisma, Postgres, Gemini for estimates                   |
| `apps/mobile`     | The Expo app (added separately)                                             |

## Run the API

```sh
npm install                 # also generates the Prisma client
cp .env.example .env        # then set GEMINI_API_KEY
scripts/dev-db.sh start     # local Postgres 16 on 127.0.0.1:54329 (see below)
npm run db:migrate          # apply migrations to DATABASE_URL
npm run dev:api             # http://localhost:3000, restarts on change
```

```sh
curl localhost:3000/health
curl -X POST localhost:3000/v1/users/bootstrap -H "x-device-id: $(uuidgen)"
```

Every `/v1` route needs an `x-device-id` header holding a UUID v4, and a device must call
`POST /v1/users/bootstrap` once before anything else. Errors always look like
`{ "error": { "code", "message", "details?" } }`.

### Local Postgres

`scripts/dev-db.sh start` initialises a cluster on first use (default `~/.sage-pg`, override with
`SAGE_PG_DIR`), starts it on port 54329 with user `sage` and no password, and creates the `sage`
and `sage_test` databases. `stop` and `status` do what they say. It needs the Postgres 16
binaries (`initdb`, `pg_ctl`, `psql`); set `SAGE_PG_BIN` if they are not on `PATH`.

Postgres will not run as root. When the script is run as root it runs the server as the
`postgres` OS user, which must be able to reach `SAGE_PG_DIR`. Any other Postgres works too:
point `DATABASE_URL` and `TEST_DATABASE_URL` at it.

### Behind an outbound proxy (local only)

Node's `fetch` ignores `HTTPS_PROXY`. Outside production, when `HTTPS_PROXY` is set, the API
routes outbound calls through it (`apps/api/src/infra/localProxy.ts`). If the proxy re-signs
TLS, start the API with `NODE_EXTRA_CA_CERTS=/path/to/ca-bundle.crt`.

## Tests and checks

```sh
npm test            # shared + api (unit, route and Postgres integration suites)
npm run typecheck
npm run lint        # ESLint (strict, type-aware) + Prettier
```

The integration suite runs the Prisma repositories against `TEST_DATABASE_URL`, applying
migrations first and truncating tables between tests. If that variable is unset the suite is
skipped with a warning and everything else still runs.

## Things worth knowing

- **Plan maths** is documented at the top of `packages/shared/src/domain/plan.ts`.
- **Time zones:** `GET /v1/days/:date` takes `tzOffsetMinutes` with the sign JavaScript's
  `new Date().getTimezoneOffset()` uses (India is `-330`).
- **AI fallback:** models in `GEMINI_MODELS` are tried in order with a per-attempt timeout. If
  all fail the API answers `503 ESTIMATOR_UNAVAILABLE` so the app can keep the photo and retry.
  Each attempt is logged to the `AiRequest` table without the image or text.
- **The device id is the only credential.** Anyone holding it can read and change that device's
  data, so the app must store it securely and always use HTTPS.
- **Rate limiting** on `/v1/meals/estimate` is per device and held in memory, so it is
  per-process. Use a shared store before running more than one instance.
