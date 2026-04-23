import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import Script from "next/script";
import { cookies } from "next/headers";
import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import { UiVariantToggle } from "@/components/ui-variants/switchers/UiVariantToggle";
import { resolveUiVariantFromCookies } from "@/lib/uiVariant";
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
  description: "Live daily context from connected Gmail, Google Calendar, and Todoist",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const serverVariant = resolveUiVariantFromCookies(cookieStore) ?? "classic";
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${displaySans.variable} ${plexMono.variable} antialiased`}
        style={{
          minHeight: "100vh",
          backgroundColor: "var(--canvas, #f5f7fb)",
          color: "var(--ink, #0f172a)",
        }}
      >
        <Script id="theme-switcher" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem("myassist-theme");if(t==="neon"||t==="kpop-demon-hunters"||t==="zara-larsson")document.documentElement.setAttribute("data-theme",t);else document.documentElement.removeAttribute("data-theme");}catch(e){}})();`}
        </Script>
        <AuthSessionProvider>
          {/* Keep variant toggle global for side-by-side evaluation across current routes. */}
          <div className="ui-variant-toggle-shell">
            <UiVariantToggle serverVariant={serverVariant} />
          </div>
          {children}
        </AuthSessionProvider>
      </body>
    </html>
  );
}
