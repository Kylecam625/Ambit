import { NextRequest } from "next/server";
import { bad_request, internal_error } from "@/lib/api/error_response";
import {
  is_govee_configured,
  govee_get_devices,
  get_preferred_govee_device,
  set_preferred_govee_device,
} from "@/lib/govee/govee_client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/govee/devices — List Govee devices + the preferred device.
 */
export async function GET(): Promise<Response> {
  if (!is_govee_configured()) {
    return Response.json({
      configured: false,
      devices: [],
      preferred_device: null,
      message: "Govee is not configured. Add GOVEE_API_KEY to .env.",
    });
  }

  try {
    const devices = await govee_get_devices();
    return Response.json({
      configured: true,
      devices,
      preferred_device: get_preferred_govee_device(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to fetch Govee devices.";
    console.error("[Govee devices] GET failed:", error);
    return internal_error(msg);
  }
}

/**
 * PUT /api/govee/devices — Select a preferred Govee device.
 * Body: { device: string, sku: string, name: string }
 */
export async function PUT(request: NextRequest): Promise<Response> {
  if (!is_govee_configured()) {
    return bad_request("Govee is not configured.");
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const device = typeof body["device"] === "string" ? body["device"].trim() : "";
    const sku = typeof body["sku"] === "string" ? body["sku"].trim() : "";
    const name = typeof body["name"] === "string" ? body["name"].trim() : "";

    if (!device || !sku) {
      return bad_request("device and sku are required.");
    }

    set_preferred_govee_device({ device, sku, name });

    return Response.json({
      ok: true,
      preferred_device: { device, sku, name },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to set preferred Govee device.";
    console.error("[Govee devices] PUT failed:", error);
    return internal_error(msg);
  }
}
