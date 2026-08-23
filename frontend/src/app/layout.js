import "./globals.css";
import AuthProvider from "@/components/auth/AuthProvider";

export const metadata = {
  title: "TejAi — AI Skincare Coach",
  description:
    "Scan your face, explore cosmetic skin concerns, and get a personalized wellness routine.",
  keywords: "AI skincare, skin analysis, glow score, skincare routine, face scan",
  openGraph: {
    title: "TejAi — AI Skincare Coach",
    description: "Explore cosmetic skin insights and a personalized wellness routine.",
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
