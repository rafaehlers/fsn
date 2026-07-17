import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: "FSN // File System Navigator",
    description: "Explore seus diretórios como uma paisagem tridimensional inspirada no FSN da Silicon Graphics.",
    openGraph: {
      title: "FSN // File System Navigator",
      description: "Fly through your files in a local, private 3D landscape.",
      type: "website",
      images: [{ url: new URL("/og.png", metadataBase).toString(), width: 1536, height: 1024, alt: "FSN 3D File System Navigator" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "FSN // File System Navigator",
      description: "Fly through your files in a local, private 3D landscape.",
      images: [new URL("/og.png", metadataBase).toString()],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
