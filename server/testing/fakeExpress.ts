/**
 * Captures routes registered by a `register*Routes(app)` function so a test can
 * invoke a single handler directly, with no HTTP server and no new dependency.
 *
 * Only the *last* handler in a chain runs — the preceding rate-limit middleware
 * is covered by its own tests and would otherwise need a live store here.
 */

type Handler = (req: any, res: any) => unknown;

export interface FakeResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  redirectedTo: string | null;
}

export interface FakeExpress {
  /** Pass this where the code expects an `Express` app. */
  app: any;
  routes: Map<string, Handler[]>;
  invoke(method: string, path: string, req?: Record<string, unknown>): Promise<FakeResponse>;
  post(path: string, req?: Record<string, unknown>): Promise<FakeResponse>;
}

export function createFakeExpress(): FakeExpress {
  const routes = new Map<string, Handler[]>();

  const register = (method: string) => (path: string, ...handlers: Handler[]) => {
    routes.set(`${method.toUpperCase()} ${path}`, handlers);
    return app;
  };

  const app: any = {
    get: register("get"),
    post: register("post"),
    put: register("put"),
    patch: register("patch"),
    delete: register("delete"),
    use: () => app,
  };

  async function invoke(method: string, path: string, req: Record<string, unknown> = {}) {
    const key = `${method.toUpperCase()} ${path}`;
    const handlers = routes.get(key);
    if (!handlers?.length) {
      throw new Error(`No route registered for ${key}. Registered: ${[...routes.keys()].join(", ")}`);
    }

    const response: FakeResponse = { statusCode: 200, body: undefined, headers: {}, redirectedTo: null };
    const res: any = {
      status(code: number) {
        response.statusCode = code;
        return res;
      },
      json(payload: unknown) {
        response.body = payload;
        return res;
      },
      send(payload: unknown) {
        response.body = payload;
        return res;
      },
      setHeader(name: string, value: string) {
        response.headers[name.toLowerCase()] = value;
        return res;
      },
      getHeader(name: string) {
        return response.headers[name.toLowerCase()];
      },
      cookie() {
        return res;
      },
      redirect(target: string) {
        response.redirectedTo = target;
        return res;
      },
      locals: {},
    };

    const request: any = {
      body: {},
      query: {},
      headers: {},
      ip: "203.0.113.10",
      socket: { remoteAddress: "203.0.113.10" },
      get: (name: string) => request.headers[name.toLowerCase()],
      ...req,
    };

    await handlers[handlers.length - 1](request, res);
    return response;
  }

  return {
    app,
    routes,
    invoke,
    post: (path, req) => invoke("post", path, req),
  };
}
