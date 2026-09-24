import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { mobileApi, type Question } from '../api/client';
import { radius, spacing, useThemedStyles, type ThemeColors } from '../theme';

type QuestionImage = { src: string; alt?: string; caption?: string };

function items(question: Question): QuestionImage[] {
  const legacy = question.image
    ? Array.isArray(question.image) ? question.image : [question.image]
    : [];
  return [...(question.images || []), ...legacy]
    .map((item) => typeof item === 'string' ? { src: item } : item)
    .filter((item): item is QuestionImage => Boolean(item?.src));
}

function Picture({ image, index }: { image: QuestionImage; index: number }) {
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const [ratio, setRatio] = useState(1.5);
  const [failed, setFailed] = useState(false);
  const uri = mobileApi.communityImageUrl(image.src);
  useEffect(() => {
    setFailed(false);
    Image.getSize(uri, (w, h) => setRatio(w > 0 && h > 0 ? w / h : 1.5), () => setRatio(1.5));
  }, [uri]);
  const pictureWidth = Math.min(width - spacing.lg * 4, 600);
  const pictureHeight = Math.max(110, Math.min(480, pictureWidth / ratio));
  return (
    <View style={styles.card}>
      {failed ? (
        <Text style={styles.missing}>第 {index + 1} 张题图暂时无法加载</Text>
      ) : (
        <Image
          accessibilityLabel={image.alt || `题目配图 ${index + 1}`}
          onError={() => setFailed(true)}
          resizeMode="contain"
          source={{ uri }}
          style={{ width: '100%', height: pictureHeight }}
        />
      )}
      {!!image.caption && <Text style={styles.caption}>{image.caption}</Text>}
    </View>
  );
}

export function QuestionImages({ question }: { question: Question }) {
  const images = items(question);
  if (!images.length) return null;
  return <View style={{ gap: spacing.xs }}>{images.map((image, index) =>
    <Picture image={image} index={index} key={`${image.src}-${index}`} />,
  )}</View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
    padding: spacing.xs,
  },
  caption: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  missing: { color: colors.warning, fontSize: 13, padding: spacing.sm },
});
