import { Container, getRandom } from "@cloudflare/containers";
import { env as workerEnv } from "cloudflare:workers";
import {
  collectContainerEnvironment,
  getConfiguredBaseDomain,
  getConfiguredInstanceCount,
  isLfmsHostname,
  isPlatformHostname,
  isReservedDeploymentHostname,
  normalizeEdgeHostname,
  normalizeContainerRequest,
  resolveEdgeAssetPath,
  sanitizeContainerResponse,
  secureEdgeResponse,
  shouldProxyToContainer,
} from "./runtime";

const INSTANCE_COUNT = getConfiguredInstanceCount(
  workerEnv as unknown as Record<string, unknown>
);
const BASE_DOMAIN = getConfiguredBaseDomain(
  workerEnv as unknown as Record<string, unknown>
);
const CONTAINER_ENV = collectContainerEnvironment(
  workerEnv as unknown as Record<string, unknown>
);

export class LfmsWebContainer extends Container {
  defaultPort = 3000;
  requiredPorts = [3000];
  pingEndpoint = `${BASE_DOMAIN}/health/live`;
  sleepAfter = "30m";
  envVars = CONTAINER_ENV;

  override async onStart() {
    const readiness = await this.containerFetch(
      new Request(`https://${BASE_DOMAIN}/health/ready`),
      3000
    );
    await readiness.body?.cancel();
    if (!readiness.ok) {
      await this.destroy();
      throw new Error(`LFMS container readiness failed (${readiness.status})`);
    }
  }

  override onError(error: unknown) {
    console.error("LFMS container failed", {
      errorName: error instanceof Error ? error.name : "NonErrorThrown",
    });
    throw error;
  }
}

type WorkerBindings = {
  ASSETS: Fetcher;
  LFMS_WEB: DurableObjectNamespace<LfmsWebContainer>;
  BASE_DOMAIN?: string;
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  EMAIL?: SendEmail;
  INTERNAL_API_SECRET?: string;
} & Record<string, unknown>;

const INTERNAL_SEND_EMAIL_PATH = "/__internal/send-email";

async function handleInternalSendEmail(
  request: Request,
  env: WorkerBindings
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Not found", { status: 404 });
  }
  const secret = env.INTERNAL_API_SECRET;
  const provided = request.headers.get("authorization");
  if (!secret || provided !== `Bearer ${secret}`) {
    return new Response("Not found", { status: 404 });
  }
  if (!env.EMAIL) {
    return Response.json({ error: "Email binding is not configured" }, { status: 503 });
  }
  let body: { from?: string; to?: string; subject?: string; text?: string; html?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!body.from || !body.to || !body.subject || (!body.text && !body.html)) {
    return Response.json({ error: "Missing required email fields" }, { status: 400 });
  }
  try {
    await env.EMAIL.send({
      from: body.from,
      to: body.to,
      subject: body.subject,
      text: body.text,
      html: body.html,
    });
    return Response.json({ success: true });
  } catch (error) {
    console.error("LFMS internal send-email failed", {
      errorName: error instanceof Error ? error.name : "NonErrorThrown",
    });
    return Response.json({ error: "Email send failed" }, { status: 502 });
  }
}

export default {
  async fetch(request: Request, env: WorkerBindings): Promise<Response> {
    const url = new URL(request.url);
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
    const baseDomain = getConfiguredBaseDomain(env, BASE_DOMAIN);
    const hostname = normalizeEdgeHostname(url.hostname);
    if (
      !isLfmsHostname(hostname, baseDomain) ||
      isReservedDeploymentHostname(hostname, baseDomain)
    ) {
      return secureEdgeResponse(
        new Response("Misdirected request", { status: 421 }),
        env,
        requestId
      );
    }
    if (url.protocol !== "https:" || url.hostname !== hostname) {
      url.protocol = "https:";
      url.hostname = hostname;
      return secureEdgeResponse(
        new Response(null, {
          status: 308,
          headers: { Location: url.toString() },
        }),
        env,
        requestId
      );
    }
    if (hostname === `www.${baseDomain}`) {
      url.hostname = baseDomain;
      return secureEdgeResponse(
        new Response(null, {
          status: 308,
          headers: { Location: url.toString() },
        }),
        env,
        requestId
      );
    }
    if (url.pathname === INTERNAL_SEND_EMAIL_PATH) {
      return handleInternalSendEmail(request, env);
    }
    if (hostname === `auth.${baseDomain}`) {
      return secureEdgeResponse(
        new Response("Not found", {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
        env,
        requestId
      );
    }

    const isPlatform = isPlatformHostname(hostname, baseDomain);
    if (!shouldProxyToContainer(request)) {
      const assetPath = resolveEdgeAssetPath(url.pathname, isPlatform);
      if (!assetPath) {
        return secureEdgeResponse(
          new Response("Not found", { status: 404 }),
          env,
          requestId,
          { platform: isPlatform }
        );
      }

      try {
        const assetUrl = new URL(request.url);
        assetUrl.pathname = assetPath;
        assetUrl.search = "";
        const assetHeaders = new Headers(request.headers);
        const isHtml = assetPath.endsWith(".html");
        if (isHtml) {
          assetHeaders.delete("if-modified-since");
          assetHeaders.delete("if-none-match");
          assetHeaders.delete("range");
        }
        const response = await env.ASSETS.fetch(
          new Request(assetUrl, {
            method: request.method,
            headers: assetHeaders,
          })
        );
        return secureEdgeResponse(response, env, requestId, {
          html: isHtml && response.ok,
          platform: isPlatform,
        });
      } catch (error) {
        console.error("LFMS static assets unavailable", {
          requestId,
          errorName: error instanceof Error ? error.name : "NonErrorThrown",
        });
        return secureEdgeResponse(
          new Response("Service temporarily unavailable", { status: 503 }),
          env,
          requestId,
          { platform: isPlatform }
        );
      }
    }

    try {
      const container = await getRandom(env.LFMS_WEB, INSTANCE_COUNT);
      const response = await container.fetch(
        normalizeContainerRequest(request, requestId)
      );
      return sanitizeContainerResponse(response, requestId);
    } catch (error) {
      console.error("LFMS container unavailable", {
        requestId,
        errorName: error instanceof Error ? error.name : "NonErrorThrown",
      });
      return secureEdgeResponse(
        new Response("Service temporarily unavailable", {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Retry-After": "30",
          },
        }),
        env,
        requestId
      );
    }
  },
};
