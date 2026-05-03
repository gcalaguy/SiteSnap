const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver = config.resolver ?? {};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Shim expo-secure-store with AsyncStorage-based fallback (Expo Go compatible)
  if (moduleName === "expo-secure-store") {
    return {
      filePath: path.resolve(__dirname, "shims/expo-secure-store.ts"),
      type: "sourceFile",
    };
  }

  // Redirect ExpoCryptoAES native module to its pure-JS Web Crypto implementation.
  // @clerk/clerk-expo v2 uses expo-crypto@55 which has ExpoCryptoAES as a native module
  // that is not compiled into Expo Go SDK 54. The .web.js version uses WebCrypto API
  // (available in React Native via Hermes) and works without a native binary.
  if (
    moduleName === "./ExpoCryptoAES" &&
    context.originModulePath &&
    context.originModulePath.includes("expo-crypto") &&
    context.originModulePath.includes("/aes/")
  ) {
    const webImpl = path.resolve(
      path.dirname(context.originModulePath),
      "ExpoCryptoAES.web.js"
    );
    return { filePath: webImpl, type: "sourceFile" };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
