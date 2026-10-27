import type { MetadataRoute } from "next";

/** Versão do desenho dos ícones (2 = marca "Andares"). */
const BRAND_VERSION = 2;

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Condtrack · Gestão Condominial",
    short_name: "Condtrack",
    start_url: "/dashboard",
    display: "standalone",
    // Fundo da abertura nativa do Android (ícone sobre esta cor), emendando na tela de abertura do app
    background_color: "#3b35b5",
    theme_color: "#5b5bd6",
    // ?v=: versão da marca. Trocar o desenho = subir o número; o Chrome do Android compara o manifesto e atualiza o
    // ícone do app instalado (o iPhone nunca atualiza: lá é preciso remover e adicionar de novo à tela de início)
    icons: [
      { src: `/icon.svg?v=${BRAND_VERSION}`, sizes: "any", type: "image/svg+xml" },
      { src: `/icon-192.png?v=${BRAND_VERSION}`, sizes: "192x192", type: "image/png" },
      { src: `/icon-512.png?v=${BRAND_VERSION}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
