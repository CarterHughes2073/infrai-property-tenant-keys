import { createServer, type ServerResponse } from "node:http";
import { ZodError, type ZodType } from "zod";
import { InfraiClient, InfraiError } from "./infrai_control_plane.js";
import {
  OffboardTenantBody,
  ProvisionTenantBody,
  TenantLifecycle,
} from "./tenant_lifecycle.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const lifecycle = new TenantLifecycle(new InfraiClient(apiKey));

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

async function readBody<T>(request: AsyncIterable<unknown>, schema: ZodType<T>): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
  return schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/tenants/provision") {
      const input = await readBody(request, ProvisionTenantBody);
      send(response, 201, await lifecycle.provision(input));
      return;
    }

    if (request.method === "POST" && request.url === "/tenants/offboard") {
      const input = await readBody(request, OffboardTenantBody);
      send(response, 200, await lifecycle.offboard(input));
      return;
    }

    send(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      send(response, 400, { error: "Invalid request body" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code, detail: error.detail });
      return;
    }
    send(response, 500, { error: "Request could not be completed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Property tenant service listening on ${port}`));
