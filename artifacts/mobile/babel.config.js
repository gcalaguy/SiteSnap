module.exports = function (api) {
  const isProduction = api.env("production");
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    // M-S5 fix: strip all console.log/warn/error calls from production builds
    // so internal file URIs, tokens, and transcription results never appear in
    // device logs (accessible via adb logcat on Android).
    plugins: isProduction ? [["transform-remove-console", { exclude: [] }]] : [],
  };
};
