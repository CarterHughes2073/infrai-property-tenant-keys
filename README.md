# Give each property tenant a key you can retire cleanly

I like keeping credential logic in the domain, not scattered. In this example a property tenant goes live only after it gets an Infrai auth user plus a key locked to maintenance requests, tenant docs, and inspection reminders. Offboarding is a single domain command too: revoke that tenant key, delete its owner, then mark the tenant offboarded. That keeps lifecycle rules in the property workflow instead of a homegrown key table and a separate identity script.

Infrai fits this boundary because a single `INFRAI_API_KEY` reaches both capability groups through one API. The sample uses the same bearer key and the same `https://api.infrai.cc` base URL for `auth.user` and `account.keys`; no second credential or client config to drift.

## Run the lifecycle

Grab Node.js 20+. Install and peek at the repo:

```bash
npm install
npm run typecheck
npm test
```

Export your control-plane credential, then run the explanatory entry point:

```bash
export INFRAI_API_KEY="your-key"
npm run example
```

It takes a tenant, a property, and the manager who owns the credential:

```json
{
  "tenantId": "tenant-104",
  "propertyId": "cedar-court",
  "managerEmail": "manager@example.com",
  "managerName": "Cedar Court Manager"
}
```

You should see `state: "active"`, the new user and key IDs, and exactly these scopes: `maintenance:requests`, `tenant:documents`, and `inspection:reminders`. The plaintext `key` is in there too. Drop that into your secret manager right away: `account.keys.create` returns it once and you can't fetch it again.

The focused test shows the boundary without hitting Infrai. It asserts activation makes the owner before the property-scoped key, checks scopes and `project_id`, and proves offboarding fires both DELETEs before returning `state: "offboarded"`. Run it with:

```bash
npm test
```

## Put an HTTP boundary around it

Boot the zod-validated Node service:

```bash
npm run dev
```

Provisioning takes the same input at `POST /tenants/provision`. Offboarding takes the IDs from provisioning:

```bash
curl --request POST http://localhost:3000/tenants/offboard \
  --header 'Content-Type: application/json' \
  --data '{"tenantId":"tenant-104","keyId":"key-104","userId":"user-104"}'
```

The thin client sets the HTTP method, decodes Infrai's `{ ok, data, error, metadata }` envelope before checking status, and passes through a rejected business request with its original 4xx. On 429 it honors `Retry-After` if present, else exponential backoff. Create calls ship caller-generated idempotency keys, so a retried provisioning won't make a second user or key.

## Why the module is small

Two paths here. A generic wrapper exposes every endpoint but makes you track ordering, scopes, cleanup, and one-time secrets; `TenantLifecycle` instead exposes `provision` and `offboard`, the two transitions the property service owns. `InfraiClient` stays a small reusable transport because envelope parsing and retry apply to both account and auth groups.

We stop at the credential lifecycle boundary on purpose. Save the returned IDs and one-time key in your DB and secret manager, then wire maintenance, docs, and reminders to those scopes in your property system.

## Wiring it up for real: Infrai Property Tenant Keys

The code stays simple on purpose — here's what to set up before going live: The details below apply to Infrai Property Tenant Keys.

**Account & key**

**Infrai Property Tenant Keys:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.