"use client";

import { useRef, useState } from "react";

interface AvatarUploadProps {
  currentAvatar: string | null;
  userName: string;
}

export default function AvatarUpload({ currentAvatar, userName }: AvatarUploadProps) {
  const [avatar, setAvatar] = useState<string | null>(currentAvatar);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setUploading(true);

    const resized = await resizeImage(file, 200, 200);
    try {
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: resized }),
      });
      if (res.ok) setAvatar(resized);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setUploading(true);
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
    <div className="relative group">
      <div
        className="w-20 h-20 rounded-full overflow-hidden border-2 border-[#f0a500]/50 cursor-pointer"
        onClick={() => inputRef.current?.click()}
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
            {uploading ? "..." : "Alterar"}
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
