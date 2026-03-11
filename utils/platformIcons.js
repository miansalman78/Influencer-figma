/**
 * Centralized platform icons so Instagram, X (Twitter), etc. use the correct icons.
 * Uses Ionicons for most platforms; X (Twitter) uses a Text "X" so it always displays without extra font linking.
 */

import React from 'react';
import { Text, View } from 'react-native';

let Ionicons;
let MaterialIcons;
try {
  const IonModule = require('react-native-vector-icons/Ionicons');
  Ionicons = IonModule.default || IonModule;
} catch (e) {
  Ionicons = null;
}
try {
  const MIModule = require('react-native-vector-icons/MaterialIcons');
  MaterialIcons = MIModule.default || MIModule;
} catch (e) {
  MaterialIcons = ({ name, size, color, style }) => null;
}

const SOCIAL_ICONS = {
  instagram: { source: 'Ionicons', name: 'logo-instagram', color: '#E1306C' },
  twitter: { source: 'XLogo', color: '#000000' },
  x: { source: 'XLogo', color: '#000000' },
  facebook: { source: 'Ionicons', name: 'logo-facebook', color: '#1877F2' },
  youtube: { source: 'Ionicons', name: 'logo-youtube', color: '#FF0000' },
  tiktok: { source: 'Ionicons', name: 'logo-tiktok', color: '#000000' },
};

/**
 * Returns { source: 'Ionicons' | 'MaterialIcons' | 'XLogo', name?: string, color: string }.
 */
export function getPlatformIcon(platform) {
  const p = (platform || '').toLowerCase();
  if (p.includes('instagram')) return SOCIAL_ICONS.instagram;
  if (p.includes('twitter') || p === 'x') return SOCIAL_ICONS.twitter;
  if (p.includes('facebook')) return SOCIAL_ICONS.facebook;
  if (p.includes('youtube')) return SOCIAL_ICONS.youtube;
  if (p.includes('tiktok')) return SOCIAL_ICONS.tiktok;
  return { source: 'MaterialIcons', name: 'link', color: '#337DEB' };
}

/**
 * Renders the correct icon for a platform (Instagram, X, etc.).
 */
export function PlatformIcon({ platform, size = 24, color, style }) {
  const iconData = getPlatformIcon(platform);
  const { source, name, color: brandColor } = iconData;
  const iconColor = color || brandColor;
  const sizeNum = typeof size === 'number' ? size : 24;

  if (source === 'XLogo') {
    return (
      <View style={[{ width: sizeNum, height: sizeNum, alignItems: 'center', justifyContent: 'center' }, style]}>
        <Text
          style={{
            color: iconColor,
            fontSize: Math.round(sizeNum * 0.85),
            fontWeight: '800',
            lineHeight: sizeNum,
            includeFontPadding: false,
          }}
          allowFontScaling={false}
        >
          X
        </Text>
      </View>
    );
  }
  if (source === 'Ionicons' && Ionicons) {
    return <Ionicons name={name} size={sizeNum} color={iconColor} style={style} />;
  }
  return <MaterialIcons name={name} size={sizeNum} color={iconColor} style={style} />;
}

export default PlatformIcon;
