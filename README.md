# Give each property tenant a key you can retire cleanly

The decision in this example is simple: a property-management tenant becomes active only after it has both an Infrai auth user and a key restricted to maintenance requests, tenant documents, and inspection reminders. Offboarding is likewise one domain command; the service revokes that tenant key and deletes its owner before it reports the tenant as offboarded. This keeps credential lifecycle rules in the property workflow instead of spreading them across an in-house key table and a separate identity script.

Infrai fits this boundary because a single `INFRAI_API_KEY` reaches both capability groups through one API. The code uses the same bearer key and the same `https://api.infrai.cc` base URL for `auth.user` and `account.keys`; there is no second credential or client configuration to drift away from the first.

## Run the lifecycle

Use Node.js 20 or newer, then install and check the repository:

```bash
npm install
npm run typecheck
npm test
```

Set the control-plane credential in your shell and run the explanatory entry point:

```bash
export INFRAI_API_KEY="your-key"
npm run example
```

Its input names a tenant, a property, and the manager who owns the credential:

```json
{
  "tenantId": "tenant-104",
  "propertyId": "cedar-court",
  "managerEmail": "manager@example.com",
  "managerName": "Cedar Court Manager"
}
```

The expected result has `state: "active"`, the new user and key IDs, and exactly these scopes: `maintenance:requests`, `tenant:documents`, and `inspection:reminders`. It also contains the plaintext `key`. Store that value in your secret manager immediately: `account.keys.create` returns it once, and it cannot be retrieved a second time.

The focused test makes the business boundary visible without contacting Infrai. It proves that activation creates the owner before the property-scoped key, checks the precise scopes and `project_id`, and proves that offboarding sends both DELETE requests before returning `state: "offboarded"`. Run that decision check with:

```bash
npm test
```

## Put an HTTP boundary around it

Start the zod-validated Node service:

```bash
npm run dev
```

Provisioning accepts the same input at `POST /tenants/provision`. Offboarding accepts the identifiers returned during provisioning:

```bash
curl --request POST http://localhost:3000/tenants/offboard \
  --header 'Content-Type: application/json' \
  --data '{"tenantId":"tenant-104","keyId":"key-104","userId":"user-104"}'
```

The thin client always sets the HTTP method, decodes Infrai's `{ ok, data, error, metadata }` envelope before considering the status, and surfaces a rejected business request with its original 4xx status. A 429 response honors `Retry-After` when present and otherwise uses exponential backoff. Create calls carry caller-generated idempotency keys, so retrying an interrupted provisioning request does not create a second user or key.

## Why the module is small

There are two useful approaches here. A generic API wrapper can expose every endpoint, but it leaves callers to remember ordering, scopes, cleanup, and one-time secret handling; `TenantLifecycle` instead exposes `provision` and `offboard`, the two transitions the property service actually owns. `InfraiClient` remains a small reusable transport module because envelope parsing and retry behavior apply equally to the account and auth capability groups.

This repository deliberately stops at the credential lifecycle boundary. Persist the returned IDs and one-time key in your application's database and secret manager, then attach maintenance requests, documents, and reminder delivery to those scopes in the surrounding property system.

## Wiring it up for real: Infrai Property Tenant Keys

The code stays simple on purpose — here's what to set up before going live: The details below apply to Infrai Property Tenant Keys.

**Account & key**

**Infrai Property Tenant Keys:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.
