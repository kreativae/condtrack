import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { getThemeAppearance } from "@/lib/theme-appearance-server";
import { resolveColors, themeCss } from "@/lib/theme-appearance";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "Condtrack · Gestão Condominial", template: "%s · Condtrack" },
  description: "Gestão condominial com transparência total: ordens de serviço, registro visual e aprovações.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Condtrack", statusBarStyle: "default" },
};

// Barra do navegador no celular acompanha o fundo de Configurações → Aparência
export async function generateViewport(): Promise<Viewport> {
  const t = await getThemeAppearance();
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: resolveColors(t, "light").bg },
      { media: "(prefers-color-scheme: dark)", color: resolveColors(t, "dark").bg },
    ],
    width: "device-width",
    initialScale: 1,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [jar, appearance] = await Promise.all([cookies(), getThemeAppearance()]);
  const theme = jar.get("theme")?.value === "dark" ? "dark" : "light";
  // Cores personalizadas (só #rrggbb validados), valendo para todas as páginas
  const css = themeCss(appearance);
  return (
    <html lang="pt-BR" data-theme={theme} className={`${inter.variable} ${jakarta.variable} h-full`}>
      {css && (
        <head>
          <style id="theme-appearance" dangerouslySetInnerHTML={{ __html: css }} />
        </head>
      )}
      <body className="min-h-full">{children}</body>
    </html>
  );
}
