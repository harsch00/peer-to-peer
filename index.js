/**
 * p2p-mesh entry point.
 * Boots the Bitchat-style mesh node before mounting the React tree.
 */
import './src/polyfills/textEncodingPolyfill';
import './src/polyfills/cryptoPolyfill';
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {bootstrapMesh} from './src/core/mesh/bootstrap';

try {
  // Notifee warns if no background handler is registered.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const notifee = require('@notifee/react-native').default;
  notifee.onBackgroundEvent(async () => {
    // No-op: app currently has no action buttons/background tasks.
  });
} catch {
  // Notifee optional per-platform dependency.
}

AppRegistry.registerComponent(appName, () => App);

// Bootstrap async after registration so startup errors never block
// AppRegistry from mounting the root component.
setTimeout(() => {
  bootstrapMesh().catch(err => {
    // Surface bootstrap errors to the diagnostic log instead of crashing
    // eslint-disable-next-line no-console
    console.error('[mesh-bootstrap]', err);
  });
}, 0);
