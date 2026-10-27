import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { getAdsModule, resolveUnitId } from '@/lib/ads-native';

/**
 * Small fixed-size banner. Renders nothing while the ads SDK is unavailable
 * or has no fill, so a missing ad never leaves a broken placeholder — or
 * crashes a build that lacks the native module.
 */
export function AdBanner() {
  const [failed, setFailed] = useState(false);
  const ads = getAdsModule();
  if (!ads || failed) return null;

  const { BannerAd, BannerAdSize } = ads;
  return (
    <View style={styles.wrap}>
      <BannerAd
        unitId={resolveUnitId('banner')}
        size={BannerAdSize.BANNER}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
});
