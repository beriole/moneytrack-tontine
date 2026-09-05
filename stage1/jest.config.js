module.exports = {
  preset: "react-native",
  setupFiles: ["<rootDir>/jestSetup.js"],
  transformIgnorePatterns: [
    "node_modules/(?!(react-native|@react-native|react-native-vector-icons|react-native-reanimated|@react-navigation)/)"
  ],
  testPathIgnorePatterns: ["/node_modules/", "/android/", "/ios/"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  cacheDirectory: ".jest/cache",
};
