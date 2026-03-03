## Composio Integration Overview

Composio is an integration platform that provides a unified API, auth, and action layer for hundreds of SaaS apps (Gmail, Outlook, Slack, Notion, etc.). Instead of building and maintaining separate OAuth flows and API calls for each provider, you use Composio to:

- **Handle authentication** (OAuth, API keys, etc.) for user accounts.
- **Store and manage connections** between your users and external apps.
- **Expose normalized actions and triggers** (e.g. "send email", "list calendar events") across many platforms.

In this project you can integrate Composio alongside your existing backend (Next.js + Inngest) to:

- Replace or supplement custom OAuth flows.
- Run actions (send email, sync data, etc.) in background jobs.
- Keep a consistent pattern for connecting any new platform.

> **Note:** API shapes below are intentionally written as **TypeScript-style pseudo-code** based on the `composio-core` SDK. Always confirm exact method names and options in the official docs (`https://docs.composio.dev`) and the `composio-core` README.

---

## Libraries and Packages

- **Backend SDK**: `composio-core` (Node.js / TypeScript)
  - Install: 

    ```bash
    npm install composio-core
    # or
    yarn add composio-core
    ```

- **Job orchestration (optional but recommended)**: `inngest`
  - Already used in this project for background jobs; you can call Composio actions from Inngest functions.

- **Web framework**: Next.js (API routes under `app/api/*`).

---

## Core Concepts

- **Integration / App**: A third-party platform Composio supports, e.g. `"gmail"`, `"outlook"`, `"slack"`.
- **Connection**: A specific user's authenticated link to an integration (e.g. user A ↔ Gmail account X).
- **Actions**: Operations you can run against a connection, e.g. `"gmail.send_email"`, `"slack.post_message"`.
- **Triggers / Webhooks**: Events fired when something happens in the external app (new email, new message, etc.).
- **External User ID**: Your internal user ID (`user.id`) that Composio uses to group connections.

---

## 1. Backend: Initializing the Composio Client

Create a small wrapper around the Composio SDK so the rest of your code can import a configured client.

```typescript
// lib/composio/client.ts (example)
import { Composio } from "composio-core"; // check docs for exact export name

export const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY!,           // from Composio dashboard
  environment: process.env.NODE_ENV === "production"
    ? "production"
    : "development",
});
```

**Environment variables (typical):**

- `COMPOSIO_API_KEY`
- Optionally: `COMPOSIO_ENVIRONMENT` if you use explicit environments.

---

## 2. Creating a “Connect App” Flow (OAuth via Composio)

High-level flow:

1. User clicks **“Connect Gmail”** (or any app) in your integrations UI.
2. Frontend hits a backend route (e.g. `/api/composio/connect-link`) with:
   - `platform` (e.g. `"gmail"`)
   - `externalUserId` (your `session.user.id`)
3. Backend asks Composio to create a **connection session** and returns a **redirect URL**.
4. Frontend redirects the user to that URL; Composio handles OAuth + consent.
5. Composio redirects back to your `redirectUrl` and/or calls your webhook with connection details.
6. Your backend updates the local `Integration` row and triggers any background jobs (Inngest).

### 2.1 Next.js API route to create a connect link

```typescript
// app/api/composio/connect-link/route.ts
import { NextRequest, NextResponse } from "next/server";
import { composio } from "@/lib/composio/client";
import { auth } from "@/lib/auth"; // your existing auth helper

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { platform } = await req.json(); // e.g. "gmail", "outlook"

  try {
    // Pseudo-code: check docs for exact method and params
    const connectSession = await composio.connections.createSession({
      integrationId: platform,             // e.g. "gmail"
      externalUserId: session.user.id,     // your internal user id
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings/integrations`,
    });

    return NextResponse.json({
      url: connectSession.url,             // where to redirect the user
    });
  } catch (err) {
    console.error("[COMPOSIO_CONNECT_LINK_ERROR]", err);
    return NextResponse.json(
      { error: "Failed to create Composio connect link" },
      { status: 500 },
    );
  }
}
```

### 2.2 Frontend: “Connect” button handler

```typescript
// Inside your integrations page component
async function handleConnect(platform: "gmail" | "outlook" | "slack") {
  const res = await fetch("/api/composio/connect-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform }),
  });

  if (!res.ok) {
    // show toast: "Connection failed"
    return;
  }

  const data = await res.json();
  window.location.href = data.url; // redirect user to Composio connect page
}
```

You can then use your existing `Integration` table and `connectedPlatformsMap` pattern to display **Connected / Not connected** states based on whether a Composio connection exists for that user + platform.

---

## 3. Handling Composio Webhooks (Connection Events)

Composio can notify your backend when connections are created, updated, or revoked. Typical flow:

1. Configure a **webhook endpoint** in the Composio dashboard (e.g. `POST /api/composio/webhook`).
2. When a user completes OAuth, Composio sends a payload describing:
   - `externalUserId`
   - `integrationId` (e.g. `"gmail"`)
   - `connectionId`
   - metadata / scopes / status
3. Your webhook handler:
   - Upserts an `Integration` row for that user + platform.
   - Optionally triggers an Inngest event (e.g. `email/gmail.sync`) to start background syncs.

### 3.1 Example webhook route

```typescript
// app/api/composio/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Shape is pseudo-code; check docs for exact fields
  const {
    eventType,               // e.g. "connection.created"
    externalUserId,
    integrationId,           // e.g. "gmail"
    connectionId,
  } = body;

  try {
    if (eventType === "connection.created") {
      await prisma.integration.upsert({
        where: {
          userId_platform: {
            userId: externalUserId,
            platform: integrationId,
          },
        },
        update: {
          externalId: connectionId,
          status: "CONNECTED",
        },
        create: {
          userId: externalUserId,
          platform: integrationId,
          externalId: connectionId,
          status: "CONNECTED",
        },
      });

      // Optionally: trigger an initial sync in background
      if (integrationId === "gmail") {
        await inngest.send({
          name: "email/gmail.sync",
          data: { userId: externalUserId },
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[COMPOSIO_WEBHOOK_ERROR]", err);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
```

---

## 4. Running Actions via Composio (Example: Send Email)

Once a user has connected, you can use Composio to run actions on their behalf.

Conceptual steps:

1. Look up the user’s connection (e.g. `Integration` row with `platform = "gmail"`).
2. Call the relevant Composio action using:
   - `externalUserId` (so Composio picks the right connection), or
   - `connectionId` if the SDK uses it directly.
3. Pass normalized parameters (subject, body, to, etc.).
4. Handle the action result or errors.

### 4.1 Example: send email from Gmail via Composio

```typescript
// lib/composio/email.ts
import { composio } from "@/lib/composio/client";

export async function sendGmailViaComposio(params: {
  userId: string;
  to: string;
  subject: string;
  text: string;
}) {
  const { userId, to, subject, text } = params;

  // Pseudo-code: actual method and action ids depend on Composio's API
  const result = await composio.actions.run({
    integrationId: "gmail",
    action: "send_email",          // e.g. composio's generic gmail send-email action
    externalUserId: userId,
    input: {
      to,
      subject,
      text,
    },
  });

  return result;
}
```

You can call this from:

- An API route (e.g. `/api/messages` when a user replies from the unified inbox).
- An Inngest function (to send scheduled digests, notifications, etc.).

---

## 5. Using Composio Inside Inngest Functions

This project already uses Inngest heavily (for Gmail/Outlook sync, webhooks, WhatsApp, vendor monitoring, etc.). You can follow the same pattern to use Composio actions as **steps** inside Inngest functions.

### 5.1 Example Inngest function: sync emails via Composio

```typescript
// lib/inngest/functions/sync-gmail-composio.ts
import { inngest } from "@/lib/inngest/client";
import { composio } from "@/lib/composio/client";

export const syncGmailViaComposio = inngest.createFunction(
  { id: "sync-gmail-via-composio" },
  { event: "email/gmail.sync" },
  async ({ event, step }) => {
    const { userId } = event.data;

    const emails = await step.run("fetch-emails-from-composio", async () => {
      // Pseudo-code: list messages from Gmail via Composio
      const res = await composio.actions.run({
        integrationId: "gmail",
        action: "list_emails",     // example action id
        externalUserId: userId,
        input: {
          maxResults: 50,
        },
      });

      return res.items ?? [];
    });

    await step.run("save-emails-to-db", async () => {
      // Map emails into your Prisma `Message` model
      // and apply your existing filtering rules (team members, contacts, etc.)
      // ...
    });

    return { count: emails.length };
  },
);
```

Register this function in `app/api/inngest/route.ts` the same way other functions are registered.

---

## 6. Integrating Multiple Platforms with a Single Pattern

With Composio you can support many platforms using a uniform pattern:

- **Platforms**: `"gmail"`, `"outlook"`, `"slack"`, `"notion"`, `"instagram"`, `"github"`, etc.
- **Shared flow**:
  - Use the same `/api/composio/connect-link` route with different `platform` values.
  - Handle `connection.created` events the same way (update `Integration` table).
  - Use `composio.actions.run()` with different `integrationId` and `action` values.

### 6.1 Example: generic “connect platform” helper

```typescript
// lib/composio/platforms.ts
export type SupportedPlatform =
  | "gmail"
  | "outlook"
  | "slack"
  | "notion"
  | "github";

export const platformDisplayName: Record<SupportedPlatform, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  slack: "Slack",
  notion: "Notion",
  github: "GitHub",
};
```

Your integrations UI can then iterate over these platforms, show the correct label, and reuse the **same** connect handler that talks to Composio.

---

## 7. Mapping Composio Connections to Your Data Model

Typical mapping:

- **Composio `externalUserId`** ↔ your `User.id`.
- **Composio `integrationId`** ↔ your `Integration.platform` enum value.
- **Composio `connectionId`** ↔ your `Integration.externalId`.

With this mapping:

- Your unified inbox and messaging logic can use `Integration` to know which channels are available.
- Background jobs (Inngest) can look up the correct connections before calling Composio actions.
- You can safely disconnect or revoke access by updating `Integration.status` and (optionally) calling the Composio API to revoke the connection.

---

## 8. Summary

- **Composio** centralizes OAuth and API access for many third-party platforms.
- Use **`composio-core`** on the backend to:
  - Create **connect sessions** (OAuth flows) for any supported app.
  - Receive **webhooks** when connections are created/updated.
  - Run **actions** (send emails, post messages, sync data) using a unified API.
- In this project’s architecture, Composio fits naturally with:
  - Next.js API routes for connect links and webhooks.
  - Prisma for persisting `Integration` / `Message` data.
  - Inngest for running background syncs and scheduled jobs.

Use this file as a starting point for wiring Composio into your actual code, and then refine method names and payloads according to the official Composio documentation and your specific integration needs.

