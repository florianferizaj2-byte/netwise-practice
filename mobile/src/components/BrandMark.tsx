import { StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../theme';

type BrandMarkProps = {
  compact?: boolean;
};

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <View style={styles.row}>
      <View style={[styles.seal, compact && styles.compactSeal]}>
        <Text style={[styles.character, compact && styles.compactCharacter]}>
          考
        </Text>
      </View>
      {!compact && <Text style={styles.wordmark}>考匠</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  seal: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radius.sm,
    height: 42,
    justifyContent: 'center',
    transform: [{ rotate: '-3deg' }],
    width: 42,
  },
  compactSeal: {
    borderRadius: 8,
    height: 30,
    width: 30,
  },
  character: {
    color: colors.white,
    fontSize: 25,
    fontWeight: '800',
  },
  compactCharacter: {
    fontSize: 18,
  },
  wordmark: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
