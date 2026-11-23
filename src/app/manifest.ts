import type { MetadataRoute } from "next";

// Web App Manifest — makes the whole LBL site installable (Add to Home Screen /
// "Instalar app") and launch chromeless, like the arena display.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LBL — Liga Beyblade Londrina",
    short_name: "LBL",
    description: "A liga oficial de Beyblade de Londrina. Torneios, batalhas e ranking.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // "any": the scoreboard/camera mode and the telão need landscape. "portrait"
    // made the INSTALLED app stay upright even with the phone lying down.
    orientation: "any",
    background_color: "#0d0d0d",
    theme_color: "#0d0d0d",
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
