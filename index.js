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

AppRegistry.registerComponent(appName, () => App);
// Temporary compatibility alias in case Metro/device cache still requests
// the older app key from previous builds.
AppRegistry.registerComponent('p3pmesh', () => App);

// Bootstrap async after registration so startup errors never block
// AppRegistry from mounting the root component.
setTimeout(() => {
  bootstrapMesh().catch(err => {
    // Surface bootstrap errors to the diagnostic log instead of crashing
    // eslint-disable-next-line no-console
    console.error('[mesh-bootstrap]', err);
  });
}, 0);
