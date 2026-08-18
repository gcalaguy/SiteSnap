const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver = config.resolver ?? {};

// Polyfill Node.js built-ins that third-party packages (e.g. react-native-svg@15
// fetchData.ts) import directly. Metro does not bundle these automatically.
// `buffer` is listed as an explicit dependency in package.json so
// require.resolve always returns a real file path regardless of lockfile changes.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  buffer: require.resolve("buffer/index.js"),
};

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

  // N-S1 fix: Only shim expo-secure-store on web. Native (iOS/Android) builds use
  // the real keychain/keystore via the native SecureStore module so that Clerk
  // auth tokens are encrypted at rest. The AsyncStorage fallback is only needed
  // on the web platform where the native module is unavailable.
  if (moduleName === "expo-secure-store" && platform === "web") {
    return {
      filePath: path.resolve(__dirname, "shims/expo-secure-store.ts"),
      type: "sourceFile",
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
