import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Datasheet Questionnaire Builder",
  description: "Create guided part-number questionnaires from industrial datasheets."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
