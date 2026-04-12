import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Investment Portfolio",
  description: "Portfolio app on Vercel",
};

/**
 * Global styles live in `public/globals.css` and are loaded via a static URL (`/globals.css`).
 * That avoids cases where the webpack CSS chunk (`/_next/static/css/...`) fails to load in dev
 * or in some embedded browsers, which leaves the app unstyled.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/globals.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
