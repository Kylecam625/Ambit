export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM_FACEAPI_SCRIPT_URL =
  "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";

export async function GET(): Promise<Response> {
  try {
    const upstream = await fetch(UPSTREAM_FACEAPI_SCRIPT_URL, { redirect: "follow" });
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      return new Response(`Failed to fetch face-api.js script\n${text}`, {
        status: upstream.status || 502,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const headers = new Headers();
    headers.set(
      "Content-Type",
      upstream.headers.get("content-type") ?? "application/javascript; charset=utf-8"
    );
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(`Failed to fetch face-api.js script\n${message}`, {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

