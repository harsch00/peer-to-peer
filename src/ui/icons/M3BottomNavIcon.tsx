/**
 * Small stroked glyphs for Material 3 bottom navigation (expressive, rounded).
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';
import {useTheme} from '../theme/ThemeProvider';
import type {RouteId} from '../../navigation/routes';

const STROKE = 1.85;

export function M3BottomNavIcon({route, active}: {route: RouteId; active: boolean}) {
  const theme = useTheme();
  const c = active ? theme.m3.primary : theme.colors.textMuted;
  const paths = GLYPHS[route];
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      {paths.map((d, i) => (
        <Path
          key={i}
          d={d}
          stroke={c}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

const GLYPHS: Record<RouteId, string[]> = {
  chats: [
    'M4.5 6.5h15a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2h-5.2l-4.8 3.2V16H4.5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2z',
  ],
  radar: [
    'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
    'M12 6.5a5.5 5.5 0 1 1 0 11',
    'M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  ],
  diagnostics: [
    'M7 8h10',
    'M7 12h10',
    'M7 16h7',
    'M16.5 15.5L19 18',
  ],
  profile: [
    'M12 12.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    'M5 20v-1a5.5 5.5 0 0 1 5.5-5.5h3A5.5 5.5 0 0 1 19 19v1',
  ],
  settings: [
    'M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5z',
    'M18 12h.75',
    'M5.25 12H6',
    'M12 5.25V6',
    'M12 18v.75',
  ],
};
