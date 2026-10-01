import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { InfraiGateway } from "./infrai_control_plane.js";

export const maintenanceKinds = [
  "maintenance:requests",
  "tenant:documents",
  "inspection:reminders",
] as const;

export const ProvisionTenantBody = z.object({
  tenantId: z.string().min(1),
  propertyId: z.string().min(1),
  managerEmail: z.string().email(),
  managerName: z.string().min(1),
});

export const OffboardTenantBody = z.object({
  tenantId: z.string().min(1),
  keyId: z.string().min(1),
  userId: z.string().min(1),
});

export type ProvisionTenantInput = z.infer<typeof ProvisionTenantBody>;
export type OffboardTenantInput = z.infer<typeof OffboardTenantBody>;

type CreatedUser = { id: string };
type CreatedKey = { id: string; key: string };

export type ProvisionedTenant = {
  state: "active";
  tenantId: string;
  propertyId: string;
  userId: string;
  keyId: string;
  key: string;
  scopes: readonly string[];
};

export type OffboardedTenant = {
  state: "offboarded";
  tenantId: string;
  revokedKeyId: string;
  deletedUserId: string;
};

export class TenantLifecycle {
  private readonly infrai: InfraiGateway;
  private readonly makeId: () => string;

  constructor(
    infrai: InfraiGateway,
    makeId: () => string = randomUUID,
  ) {
    this.infrai = infrai;
    this.makeId = makeId;
  }

  async provision(input: ProvisionTenantInput): Promise<ProvisionedTenant> {
    const operationId = this.makeId();
    const user = await this.infrai.request<CreatedUser>({
      method: "POST",
      path: "/v1/auth/user/create",
      body: {
        email: input.managerEmail,
        name: input.managerName,
        metadata: { tenantId: input.tenantId, propertyId: input.propertyId },
        mode: "service",
        idempotency_key: `tenant-user-${input.tenantId}-${operationId}`,
      },
    });

    try {
      const createdKey = await this.infrai.request<CreatedKey>({
        method: "POST",
        path: "/v1/account/keys/create",
        body: {
          project_id: input.propertyId,
          name: `tenant-${input.tenantId}`,
          scopes: Array.from(maintenanceKinds),
          idempotency_key: `tenant-key-${input.tenantId}-${operationId}`,
        },
      });

      return {
        state: "active",
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        userId: user.id,
        keyId: createdKey.id,
        key: createdKey.key,
        scopes: maintenanceKinds,
      };
    } catch (error) {
      await this.infrai.request<unknown>({
        method: "DELETE",
        path: `/v1/auth/user/delete/${encodeURIComponent(user.id)}`,
      });
      throw error;
    }
  }

  async offboard(input: OffboardTenantInput): Promise<OffboardedTenant> {
    await Promise.all([
      this.infrai.request<unknown>({
        method: "DELETE",
        path: `/v1/account/keys/revoke/${encodeURIComponent(input.keyId)}`,
      }),
      this.infrai.request<unknown>({
        method: "DELETE",
        path: `/v1/auth/user/delete/${encodeURIComponent(input.userId)}`,
      }),
    ]);

    return {
      state: "offboarded",
      tenantId: input.tenantId,
      revokedKeyId: input.keyId,
      deletedUserId: input.userId,
    };
  }
}
