import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Gate } from "./gate";
import { AuthProvider } from "./lib/auth";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "vayurix.ai console",
  description: "Root-cause analysis, incidents and SLA across every domain.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // data-theme is set client-side by the shell; default to dark so first paint matches.
  return (
    <html lang="en" data-theme="dark">
      <body className={`${sans.variable} ${mono.variable}`}>
        {/* Gate renders the sign-in flow instead of the console when there is no session. */}
        <AuthProvider>
          <Gate>{children}</Gate>
        </AuthProvider>
      </body>
    </html>
  );
}
