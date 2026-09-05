module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-worklets/plugin doit rester en dernier (requis par Reanimated 4)
    plugins: ['react-native-worklets/plugin'],
  };
};
