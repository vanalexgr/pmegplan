import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PMEGplan · CT-derived PMEG Model",
  description:
    "Interactive CT-derived PMEG reconstruction with selectable fenestrations and on-model dimensional guidance.",
  openGraph: {
    title: "PMEGplan · CT-derived PMEG Model",
    description:
      "Interactive CT-derived PMEG reconstruction with selectable fenestrations and on-model dimensional guidance.",
    siteName: "PMEGplan",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PMEGplan · CT-derived PMEG Model",
    description:
      "Interactive CT-derived PMEG reconstruction with selectable fenestrations and on-model dimensional guidance.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
