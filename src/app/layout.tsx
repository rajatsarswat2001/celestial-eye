import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
// Cesium's widget CSS gives the viewer's canvas container its sizing rules
// (width:100%/height:100% chain down to the actual <canvas>). Without this,
// nothing constrains the canvas to fill its parent — which is exactly why
// the globe was rendering tiny and stuck in a corner: the container divs
// were sized correctly, but Cesium's own internal widget classes had no
// rules applied to them at all, so the canvas fell back to whatever
// unstyled size resulted.
import "cesium/Source/Widgets/widgets.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Zenith — The Celestial Eye",
  description:
    "Pick any point on Earth and see exactly what is overhead right now — the ISS, live satellites, the Moon, planets, and stars at zenith.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-void text-ink font-sans">
        {children}
      </body>
    </html>
  );
}
