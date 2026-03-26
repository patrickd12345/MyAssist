import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import "./globals.css";

const displaySans = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "MyAssist",
  description: "Read-only daily context from n8n (Todoist, Gmail, Calendar)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${displaySans.variable} ${plexMono.variable} antialiased`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("myassist-theme");if(t==="neon"||t==="kpop-demon-hunters"||t==="zara-larsson")document.documentElement.setAttribute("data-theme",t);else document.documentElement.removeAttribute("data-theme");}catch(e){}})();`,
          }}
        />
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
