---
name: resend-email-integration
description: Instructs the agent on how to configure, implement, and orchestrate inbound and outbound email pipelines using Resend within a Next.js App Router and Firestore architecture.
---

# Skill: Resend Email Integration (Next.js & Firestore)

## 📌 Context & Capabilities
This skill instructs the agent on how to correctly configure, implement, and orchestrate inbound and outbound email pipelines using Resend within a Next.js App Router and Firestore architecture.

## 🛠️ Technical Implementation Strategy

### 1. Verification & Security (Critical Guardrail)
* **Webhooks are unauthenticated by default:** The agent must *always* implement cryptographic signature verification using the `svix` headers (`svix-id`, `svix-timestamp`, `svix-signature`) or Resend's native verification methods using the `RESEND_WEBHOOK_SECRET`.
* **Raw Payload:** Never parse the JSON body before verifying the signature. Use `req.text()` to capture the raw body.

### 2. Outbound Architecture (Server Actions)
* Utilize standard async Next.js Server Actions using `use server`.
* Inject the `Resend` instance properly using standard environment variables:
    ```typescript
    import { Resend } from 'resend';
    const resend = new Resend(process.env.RESEND_API_KEY);
    ```

### 3. Inbound Architecture (Webhook Endpoint)
* Expose a public route at `/api/webhooks/resend`.
* Handle the `email.received` payload to catch inbound data.
* **Firestore Mapping Pattern:** * Parse the email subject or body to look for project regex tokens (e.g., `PROJ-XXXX`).
    * Map the sender's address to a verified User document in the database.
    * Write the incoming data to a sub-collection (e.g., `/projects/{id}/messages`) to maintain clean, local context threading.

## 📋 Standard Verification Checklist
1. Is `RESEND_API_KEY` stored securely in `.env.local`?
2. Does the API endpoint quickly return an HTTP `200 OK` status to Resend before running complex parsing workflows?
3. Is error handling robust enough to catch malformed raw payloads?
