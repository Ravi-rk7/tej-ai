import "./globals.css";
import AuthProvider from "@/components/auth/AuthProvider";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import ObservabilityProvider from "@/components/ObservabilityProvider";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plus-jakarta",
});

export const metadata = {
  title: "TejAi — Cosmetic Skin Wellness",
  description:
    "Scan your face, explore cosmetic skin concerns, and get a personalized wellness routine.",
  keywords: "AI skincare, skin analysis, glow score, skincare routine, face scan",
  openGraph: {
    title: "TejAi — Cosmetic Skin Wellness",
    description: "Explore cosmetic skin insights and a personalized wellness routine.",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${inter.className} ${inter.variable} ${plusJakartaSans.variable} min-h-full flex flex-col antialiased`}>
        <ObservabilityProvider configuration={{
          dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
          environment: process.env.APP_ENV,
          release: process.env.NEXT_PUBLIC_RELEASE_SHA,
        }}>
          <AuthProvider>{children}</AuthProvider>
        </ObservabilityProvider>
      </body>
    </html>
  );
}
