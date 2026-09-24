import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "Condtrack · Gestão Condominial", template: "%s · Condtrack" },
  description: "Gestão condominial com transparência total: ordens de serviço, registro visual e aprovações.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Condtrack", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0d11" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = (await cookies()).get("theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang="pt-BR" data-theme={theme} className={`${inter.variable} ${jakarta.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
