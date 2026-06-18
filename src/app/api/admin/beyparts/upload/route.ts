export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { writeFile, mkdir, access, constants } from "fs/promises";
import path from "path";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE_MB = 5;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ORGANIZER") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (e) {
      return NextResponse.json({ error: `Erro ao ler formulário: ${e}` }, { status: 400 });
    }

    const file = formData.get("file") as File | null;

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Tipo inválido: ${file.type}. Use JPG, PNG, WEBP ou GIF.` }, { status: 400 });
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo ${MAX_SIZE_MB}MB.` }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const safeName = file.name
      .replace(/\.[^/.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .slice(0, 60);
    const filename = `${safeName}-${Date.now()}.${ext}`;

    const dir = path.join(process.cwd(), "public", "beyparts");

    // Ensure dir exists and is writable
    await mkdir(dir, { recursive: true });
    try {
      await access(dir, constants.W_OK);
    } catch {
      return NextResponse.json({ error: `Sem permissão de escrita na pasta: ${dir}` }, { status: 500 });
    }

    const filePath = path.join(dir, filename);
    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    return NextResponse.json({ path: `/beyparts/${filename}` });
  } catch (e) {
    console.error("[upload] error:", e);
    return NextResponse.json({ error: `Erro interno: ${String(e)}` }, { status: 500 });
  }
}
