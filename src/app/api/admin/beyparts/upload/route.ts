export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE_MB = 3;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ORGANIZER") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Tipo inválido: ${file.type}. Use JPG, PNG, WEBP ou GIF.` }, { status: 400 });
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({
        error: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo ${MAX_SIZE_MB}MB.`,
      }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    return NextResponse.json({ path: dataUrl });
  } catch (e) {
    console.error("[upload] error:", e);
    return NextResponse.json({ error: `Erro interno: ${String(e)}` }, { status: 500 });
  }
}
