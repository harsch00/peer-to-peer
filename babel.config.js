module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./'],
        alias: {
          '@': './src',
          '@core': './src/core',
          '@ui': './src/ui',
          '@state': './src/state',
          '@nav': './src/navigation',
          '@hooks': './src/hooks',
          '@utils': './src/utils',
        },
      },
    ],
    'react-native-reanimated/plugin',
  ],
};
