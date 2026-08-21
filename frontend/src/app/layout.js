import "./globals.css";
import AuthProvider from "@/components/auth/AuthProvider";

export const metadata = {
  title: "TejAi — AI Skincare Coach",
  description:
    "Scan your face, explore cosmetic skin concerns, and get a personalized wellness routine in 60 seconds.",
  keywords: "AI skincare, skin analysis, glow score, skincare routine, face scan",
  openGraph: {
    title: "TejAi — AI Skincare Coach",
    description: "Know what's wrong with your skin in 60 seconds.",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="min-h-full flex flex-col antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
