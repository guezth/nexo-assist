import type { Metadata } from "next";
import { IBM_Plex_Mono, Newsreader, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const fontUi = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-ui" });
const fontDisplay = Newsreader({ subsets: ["latin"], variable: "--font-display" });
const fontData = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-data" });

export const metadata: Metadata = {
  title: "Nexo Assist",
  description: "Service desk de TI da Nexo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${fontUi.variable} ${fontDisplay.variable} ${fontData.variable}`}>
      <body>{children}</body>
    </html>
  );
}
