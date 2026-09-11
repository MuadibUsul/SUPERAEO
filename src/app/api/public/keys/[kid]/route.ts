import { NextResponse } from "next/server";
import { publicSigningKey } from "@/server/evidence/manifest";

type Context = { params: Promise<{ kid: string }> };
export async function GET(_request: Request, { params }: Context) {
  const { kid } = await params;
  const publicKey = publicSigningKey(kid);
  return publicKey ? NextResponse.json({ kid, algorithm: "Ed25519", publicKey }, { headers: { "cache-control": "public, max-age=3600" } }) : NextResponse.json({ error: "Signing key not found." }, { status: 404 });
}
