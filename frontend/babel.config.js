// C:\Users\abhiy\OneDrive\Desktop\audio_data\frontend\babel.config.js

module.exports = function(api) {
  api.cache(true);
  return {
    presets: [
      // 1. The main Expo preset
      "babel-preset-expo",
      // 2. The NativeWind preset/plugin should be listed right after the main preset.
      // This tells Babel how to process Tailwind classes.
      "nativewind/babel", 
    ],
    plugins: [
      "expo-router/babel",
      // The reanimated plugin MUST be the last item in the plugins array!
      "react-native-reanimated/plugin", 
    ],
  };
};