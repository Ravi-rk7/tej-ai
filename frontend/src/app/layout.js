import "./globals.css";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";

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
  title: "TejAi — Skincare & Routine Tracking",
  description:
    "Explore an interactive skincare tracking demo, build a routine, and follow your progress. A software engineering portfolio project.",
  keywords: "skincare routine, progress tracking, software engineering portfolio",
  openGraph: {
    title: "TejAi — Cosmetic Skin Wellness",
    description: "Explore cosmetic skin insights and a personalized wellness routine.",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="scroll-smooth" data-scroll-behavior="smooth">
      <body className={`${inter.className} ${inter.variable} ${plusJakartaSans.variable} min-h-full flex flex-col antialiased`}>
        {children}
      </body>
    </html>
  );
}
