import { useColorScheme } from "react-native";
import React, { type PropsWithChildren } from "react";

/**
 * Root HTML template for Expo Router.
 * Fixes routing when served under a base path (e.g. /mobile/ via Replit proxy).
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const basePath = "/mobile";
                if (location.pathname.startsWith(basePath + "/") || location.pathname === basePath) {
                  const stripped = location.pathname.slice(basePath.length) || "/";
                  window.history.replaceState({}, "", stripped + location.search + location.hash);
                }
              })();
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
