# Isolated staging and production releases

The Projects app uses one repository and two Firebase projects. Staging must
never share Firestore, Auth, Storage, Functions, secrets, or service identities
with production.

## Staging-first working rule

Upgrades land on `codex/staging-isolation` and deploy only to
`incaptta-pro-staging`. Do not merge to `main`, run **Production release**, or
run `firebase deploy` without `--project incaptta-pro-staging` until production
promotion is explicitly requested.

`apphosting.yaml` is the production default. Never bind `staging-*` secrets
there. Staging overrides belong in `apphosting.staging.yaml`. App Hosting
build workers do not always inject `GOOGLE_CLOUD_PROJECT` during `next build`
page collection, so staging sets it explicitly to `incaptta-pro-staging`.

## Environments

| Environment | Firebase project | App Hosting environment name |
| --- | --- | --- |
| Staging | `incaptta-pro-staging` | `staging` |
| Production | `incaptta-pro` | `production` |

The existing production backend continues to use `apphosting.yaml` until its
environment name is explicitly set to `production`. Staging overlays
`apphosting.staging.yaml`.

## Required staging setup

1. Create the `incaptta-pro-staging` Firebase project and Web App.
2. Enable Firestore, Authentication, Storage, Functions, App Hosting, Secret
   Manager, and billing in the staging project.
3. Create an App Hosting backend rooted at `/project-management-next`, set its
   Environment name to `staging`, and leave its custom domain unset.
4. Create the staging-only Gemini and cron secrets referenced by
   `apphosting.staging.yaml`. Firebase Web App identifiers are intentionally
   stored as non-secret environment configuration.
5. Configure GitHub's `staging` environment with:
   - Secrets: `GCP_WORKLOAD_IDENTITY_PROVIDER`,
     `GCP_STAGING_DEPLOY_SERVICE_ACCOUNT`.
   - Variables: `STAGING_FIREBASE_PROJECT_ID`,
     `STAGING_APPHOSTING_BACKEND_ID`, `STAGING_BASE_URL`.
6. Give the staging deploy service account access only to the staging project.

## Required production protection

Configure a protected GitHub environment named `production` with required
reviewers. Add `GCP_WORKLOAD_IDENTITY_PROVIDER` and
`GCP_PRODUCTION_DEPLOY_SERVICE_ACCOUNT` secrets plus
`PRODUCTION_FIREBASE_PROJECT_ID`, `PRODUCTION_APPHOSTING_BACKEND_ID`, and
`PRODUCTION_BASE_URL` variables. Disable automatic production rollouts.

## Release sequence

1. Change code on `codex/staging-isolation`.
2. Manually run **Staging release** with the candidate commit SHA.
3. If the commit also needs Cloud Functions, Firestore rules, or Storage rules,
   run **Staging backend** for the same SHA, or locally
   `npm run deploy:staging-backend`. Both paths refuse any project other than
   `incaptta-pro-staging`.
4. Complete UAT at the staging URL. Testers should follow
   [docs/STAGING_TESTER_CHEATSHEET.md](../docs/STAGING_TESTER_CHEATSHEET.md)
   and [docs/STAGING_TESTER_HANDBOOK.md](../docs/STAGING_TESTER_HANDBOOK.md)
   (lead → accept → draft invoice/job → PMO session release). Confirm
   `/api/health` reports `incaptta-pro-staging` before any trial.
5. Later, when asked to promote: merge to `main` and manually run
   **Production release** with the same SHA and confirm UAT.
6. GitHub's protected production environment requires reviewer approval before
   Firebase receives the rollout request.

Set `MBDI_DUE_CRON_URL` before a production Functions deploy. The previous
hardcoded production value was
`https://incaptta-projects--incaptta-pro.europe-west4.hosted.app/api/cron/mbdi-due-reminders`.
The scheduled function is skipped on `incaptta-pro-staging`.

For rollback, use App Hosting's rollout history to instantly restore the
preceding production rollout, then verify `/api/health`.

## Known baseline

The repository-wide `npm run lint` currently reports pre-existing errors in
unrelated application modules. Release automation runs `lint:deployment` over
the environment-isolation surface and still requires the complete Next.js
production build. The global lint debt should be handled separately rather
than weakening the deployment checks.
