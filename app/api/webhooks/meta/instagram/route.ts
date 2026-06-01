import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

    console.log("[meta-webhook] verification:", {
      mode,
      tokenReceived: token?.slice(0, 8) + "...",
      hasExpectedToken: !!expectedToken,
      hasChallenge: !!challenge,
    });

    if (!expectedToken) {
      return new Response("Server not configured", { status: 500 });
    }

    if (mode === "subscribe" && token === expectedToken) {
      return new Response(challenge ?? "", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    return new Response("Forbidden", { status: 403 });
  } catch (err) {
    console.error("[meta-webhook] GET error:", err);
    return new Response("Internal error", { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[meta-webhook] event:", JSON.stringify(body).slice(0, 200));
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[meta-webhook] POST error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
