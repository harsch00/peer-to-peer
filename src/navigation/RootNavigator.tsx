/**
 * Top-level navigator: dispatches to the correct platform shell.
 */
import React from 'react';
import {Platform} from 'react-native';
import {WindowsLayout} from './WindowsLayout';
import {AndroidLayout} from './AndroidLayout';

export function RootNavigator() {
  return Platform.OS === 'windows' ? <WindowsLayout /> : <AndroidLayout />;
}
