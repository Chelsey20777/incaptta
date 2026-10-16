module.exports = {
  name: 'incaptta-mobile-rn',
  slug: 'incaptta-mobile-rn',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'incapttamobilern',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  assetBundlePatterns: [
    '**/*',
  ],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.incaptta.mobile',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    package: 'com.incaptta.mobile',
    edgeToEdgeEnabled: true,
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/favicon.png',
  },
  extra: {
    eas: {
      projectId: 'your-project-id-here',
    },
  },
  plugins: [
    'expo-router',
  ],
  experiments: {
    typedRoutes: true,
  },
};
