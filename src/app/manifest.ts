import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Condtrack · Gestão Condominial",
    short_name: "Condtrack",
    start_url: "/dashboard",
    display: "standalone",
    // Fundo da abertura nativa do Android (ícone sobre esta cor), emendando na tela de abertura do app
    background_color: "#3b35b5",
    theme_color: "#5b5bd6",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
