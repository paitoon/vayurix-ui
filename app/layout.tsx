import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const metadataBase = host ? new URL(`${protocol}://${host}`) : new URL("http://localhost:3000");
  const socialImage = new URL("/og.png", metadataBase).toString();
  return {
    metadataBase,
    title: "Vayurix Control",
    description: "Pipeline operations, root-cause analysis, reliability, and incident response in one place.",
    openGraph: { title: "Vayurix Control", description: "One place to see what broke—and what to do next.", type: "website", images: [{ url: socialImage, width: 1536, height: 1024, alt: "Vayurix operations dashboard" }] },
    twitter: { card: "summary_large_image", title: "Vayurix Control", description: "Pipeline operations, RCA & reliability", images: [socialImage] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}