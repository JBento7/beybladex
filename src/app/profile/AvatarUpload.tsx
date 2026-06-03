"use client";

import { useRef, useState } from "react";

interface AvatarUploadProps {
  currentAvatar: string | null;
  userName: string;
}

export default function AvatarUpload({ currentAvatar, userName }: AvatarUploadProps) {
  const [avatar, setAvatar] = useState<string | null>(currentAvatar);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setUploading(true);
    setError(null);

    try {
      const resized = await resizeImage(file, 200, 200);
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: resized }),
      });
      const data = await res.json();
      if (res.ok) {
        setAvatar(resized);
      } else {
        setError(data.error ?? "Erro ao salvar foto.");
      }
    } catch {
      setError("Erro de conexão.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setUploading(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: null }),
      });
      if (res.ok) setAvatar(null);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="relative group">
        <div
          className="w-20 h-20 rounded-full overflow-hidden border-2 border-[#f0a500]/50 cursor-pointer"
          onClick={() => !uploading && inputRef.current?.click()}
        >
          {avatar ? (
            <img src={avatar} alt={userName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-[#f0a500]/20 flex items-center justify-center text-4xl">
              🌀
            </div>
          )}
          <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-white text-xs font-semibold">
              {uploading ? "Salvando..." : "Alterar"}
            </span>
          </div>
        </div>
        {avatar && !uploading && (
          <button
            onClick={handleRemove}
            className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 rounded-full text-white text-xs flex items-center justify-center hover:bg-red-500"
            title="Remover foto"
          >
            ×
          </button>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-400 max-w-[200px]">{error}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  );
}

function resizeImage(file: File, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxW / img.width, maxH / img.height);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}
