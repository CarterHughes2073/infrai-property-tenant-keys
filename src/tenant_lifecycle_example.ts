import { InfraiClient } from "./infrai_control_plane.js";
import { ProvisionTenantBody, TenantLifecycle } from "./tenant_lifecycle.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the example");

const input = ProvisionTenantBody.parse({
  tenantId: "tenant-104",
  propertyId: "cedar-court",
  managerEmail: "chenhua@changba.com",
  managerName: "Cedar Court Manager",
});

const lifecycle = new TenantLifecycle(new InfraiClient(apiKey));
const result = await lifecycle.provision(input);

try {
  console.log(JSON.stringify(result, null, 2));
} finally {
  const offboarded = await lifecycle.offboard({
    tenantId: result.tenantId,
    keyId: result.keyId,
    userId: result.userId,
  });
  console.log(JSON.stringify(offboarded, null, 2));
}
