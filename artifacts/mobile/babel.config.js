module.exports = {
  presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
  // Strip all console calls from production builds so internal URIs, tokens,
  // and transcription results never appear in device logs (adb logcat).
  plugins:
    process.env.NODE_ENV === "production"
      ? [["transform-remove-console", { exclude: [] }]]
      : [],
};
