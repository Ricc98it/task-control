This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Google Calendar bridge (MVP backend)

The project now includes server endpoints to connect a user account to Google Calendar and sync events (including Google Meet links) into Supabase.

### Required environment variables

Add these values to your `.env.local`:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback
GOOGLE_OAUTH_STATE_SECRET=long-random-secret
SUPABASE_SERVICE_ROLE_KEY=...
# Optional, defaults to request origin
APP_URL=http://localhost:3000
```

### New API endpoints

- `POST /api/integrations/google/connect`
  - Auth: `Authorization: Bearer <supabase_access_token>`
  - Returns `authorizationUrl`
- `GET /api/integrations/google/callback`
  - OAuth callback endpoint for Google
- `GET /api/integrations/google/status`
  - Auth required, returns current integration status
- `POST /api/integrations/google/sync`
  - Auth required
  - Optional JSON body: `{ "forceFullSync": true }`

### Supabase migrations

- `006_add_google_calendar_bridge.sql`
  - `calendar_integrations`
  - `external_calendar_events`
  - `task_external_links`
- `007_add_workspaces_foundation.sql`
  - `workspaces`
  - `workspace_members`
  - `workspace_id` on `tasks` and `projects`
