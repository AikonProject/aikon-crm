import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Aikon CRM",
  description: "CRM personalizado para agencias de automatización con IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${dmSans.variable} font-sans antialiased`}>
        <ClerkProvider>
          {children}
          {/* Global feedback: every success / error message in the app */}
          <Toaster theme="light" position="top-right" richColors closeButton duration={5000} />
        </ClerkProvider>
      </body>
    </html>
  );
}