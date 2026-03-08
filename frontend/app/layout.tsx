import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cosentino Quality Tracker",
  description: "Sistema de control de calidad para producción de materiales",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
      </head>
      <body className="font-inter antialiased">
        {children}
      </body>
    </html>
  );
}
