import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // Gera .next/standalone para a imagem Docker (Coolify); a Vercel ignora.
  output: "standalone",
  // Fora do bundle: o pacote vai para .next/standalone/node_modules e
  // scripts/migrate-blob.mjs consegue importá-lo dentro da imagem.
  serverExternalPackages: ["@vercel/blob"],
  turbopack: { root: __dirname },
  // Só em desenvolvimento: permite abrir o app também via 127.0.0.1 (sessão separada)
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Service worker das notificações: nunca em cache e só scripts do próprio site
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
