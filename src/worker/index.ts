import { handleIntake } from "./intake";
import { errorResponse } from "./respond";
import { handleToday } from "./today";
import type { Env } from "./types";

type Handler = (request: Request, env: Env) => Promise<Response>;

const ROUTES: Record<string, { method: string; handler: Handler }> = {
  "/api/intake": { method: "POST", handler: handleIntake },
  "/api/today": { method: "GET", handler: handleToday },
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    const route = ROUTES[pathname];
    if (!route) return errorResponse("not found", 404);
    if (request.method !== route.method) return errorResponse("method not allowed", 405);
    return route.handler(request, env);
  },
} satisfies ExportedHandler<Env>;
