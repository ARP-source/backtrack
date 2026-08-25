import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Backtrack",
  description: "Find the prerequisite you're actually missing, before the course starts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
