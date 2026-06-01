const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver = config.resolver ?? {};

// Block Metro from watching pdf-parse tmp test directories (server-only package)
// Also block Vite/Vitest node_modules and all test files from the RN bundle
config.resolver.blockList = [
  /node_modules\/pdf-parse[^/]*\/.*_tmp_.*/,
  /node_modules\/.pnpm\/vite@.*/,
  /node_modules\/.pnpm\/vitest@.*/,
  /.*\.test\.(ts|tsx|js|jsx)$/,
];

const workspacePackages = {
  "@workspace/api-client-react": path.resolve(__dirname, "../../lib/api-client-react/src/index.ts"),
  "@workspace/api-zod": path.resolve(__dirname, "../../lib/api-zod/src/index.ts"),
  "@workspace/db": path.resolve(__dirname, "../../lib/db/src/index.ts"),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Resolve @workspace/* monorepo packages for Metro
  if (workspacePackages[moduleName]) {
    return {
      filePath: workspacePackages[moduleName],
      type: "sourceFile",
    };
  }

  // Shim expo-secure-store with AsyncStorage-based fallback (Expo Go compatible)
  if (moduleName === "expo-secure-store") {
    return {
      filePath: path.resolve(__dirname, "shims/expo-secure-store.ts"),
      type: "sourceFile",
    };
  }

  // Shim ExpoCryptoAES with a pure-JS Web Crypto implementation.
  // @clerk/clerk-expo v2 uses expo-crypto@55 which has ExpoCryptoAES as a native
  // module. Expo Go SDK 54 has an incompatible version compiled in, so we bypass
  // both by providing a standalone WebCrypto-based implementation that does NOT
  // call registerWebModule (avoids "cannot override host object" error).
  if (
    moduleName === "./ExpoCryptoAES" &&
    context.originModulePath &&
    context.originModulePath.includes("expo-crypto") &&
    context.originModulePath.includes("/aes/")
  ) {
    return {
      filePath: path.resolve(__dirname, "shims/ExpoCryptoAES.js"),
      type: "sourceFile",
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

// Register a global DOMException polyfill that runs before any app module. Hermes (Expo
// Go / RN 0.81) does not install a global DOMException, but some deps reference
// it (e.g. @clerk/shared telemetry's `instanceof DOMException` in a catch
// block), which otherwise throws "Property 'DOMException' doesn't exist" at
// startup. Registering as a Metro polyfill guarantees it runs before app code.
config.serializer = config.serializer ?? {};
const upstreamGetPolyfills = config.serializer.getPolyfills;
config.serializer.getPolyfills = (options) => {
  const basePolyfills = upstreamGetPolyfills ? upstreamGetPolyfills(options) : [];
  return [...basePolyfills, path.resolve(__dirname, "polyfills/dom-exception.js")];
};

module.exports = config;
