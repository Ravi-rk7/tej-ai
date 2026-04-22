import "./globals.css";

export const metadata = {
  title: "TejAi — AI Skincare Coach",
  description:
    "Scan your face, detect skin concerns, and get a personalized skincare routine in 60 seconds. Clinical-grade AI analysis in the palm of your hand.",
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
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
