export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM_WEIGHTS_BASE_URL =
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights";

const is_safe_path_segment = (segment: string): boolean => /^[a-zA-Z0-9._-]+$/.test(segment);

export async function GET(
  _req: Request,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const resolved = await context.params.catch(() => ({ path: [] as string[] }));
  const segments = Array.isArray(resolved?.path) ? resolved.path : [];
  if (segments.length === 0) {
    return new Response("Missing file path.", { status: 400 });
  }
  if (segments.some((s) => typeof s !== "string" || !is_safe_path_segment(s))) {
    return new Response("Invalid file path.", { status: 400 });
  }

  const path = segments.join("/");
  const url = `${UPSTREAM_WEIGHTS_BASE_URL}/${path}`;

  try {
    const upstream = await fetch(url, { redirect: "follow" });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      return new Response(
        `Failed to fetch face model file: ${path}\nUpstream: ${upstream.status} ${upstream.statusText}\n${text}`,
        {
          status: upstream.status || 502,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }
      );
    }

    const headers = new Headers();
    const content_type =
      upstream.headers.get("content-type") ??
      (path.endsWith(".json") ? "application/json; charset=utf-8" : "application/octet-stream");
    headers.set("Content-Type", content_type);

    // Versioned + immutable (pinned upstream tag). Let the browser cache aggressively.
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(`Failed to fetch face model file: ${path}\n${message}`, {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

