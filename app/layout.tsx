import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maildesk — Your business, in one inbox",
  description: "A private workspace for your business email accounts.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
