import assert from "node:assert/strict";
import test from "node:test";
import type { InfraiGateway, RequestOptions } from "../src/infrai_control_plane.js";
import { TenantLifecycle, maintenanceKinds } from "../src/tenant_lifecycle.js";

test("provisions one scoped key for the property tenant and its owner", async () => {
  const calls: RequestOptions[] = [];
  const gateway: InfraiGateway = {
    async request<T>(options: RequestOptions): Promise<T> {
      calls.push(options);
      return (calls.length === 1
        ? { id: "user-104" }
        : { id: "key-104", key: "one-time-plaintext" }) as T;
    },
  };

  const result = await new TenantLifecycle(gateway, () => "operation-7").provision({
    tenantId: "tenant-104",
    propertyId: "cedar-court",
    managerEmail: "manager@example.com",
    managerName: "Cedar Court Manager",
  });

  assert.equal(result.state, "active");
  assert.deepEqual(result.scopes, maintenanceKinds);
  assert.equal(result.userId, "user-104");
  assert.deepEqual(calls.map(({ method, path }) => ({ method, path })), [
    { method: "POST", path: "/v1/auth/user/create" },
    { method: "POST", path: "/v1/account/keys/create" },
  ]);
  assert.deepEqual(calls[1]?.body?.scopes, Array.from(maintenanceKinds));
  assert.equal(calls[1]?.body?.project_id, "cedar-court");
});

test("removes both the scoped key and its owner before reporting offboarding", async () => {
  const calls: RequestOptions[] = [];
  const gateway: InfraiGateway = {
    async request<T>(options: RequestOptions): Promise<T> {
      calls.push(options);
      return undefined as T;
    },
  };

  const result = await new TenantLifecycle(gateway).offboard({
    tenantId: "tenant-104",
    keyId: "key-104",
    userId: "user-104",
  });

  assert.equal(result.state, "offboarded");
  assert.deepEqual(new Set(calls.map((call) => call.path)), new Set([
    "/v1/account/keys/revoke/key-104",
    "/v1/auth/user/delete/user-104",
  ]));
  assert.ok(calls.every((call) => call.method === "DELETE" && call.body === undefined));
});
