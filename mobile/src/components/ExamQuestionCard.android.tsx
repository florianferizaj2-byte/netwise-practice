import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { Question } from '../api/client';
import { useThemedStyles, type ThemeColors } from '../theme';
import { AnimatedPressable } from './Motion';
import { QuestionImages } from './QuestionImages';

// One renderer for the real exam and location-learning exam. Changing its
// typography, option alignment or hit areas keeps both experiences identical.
export const ExamQuestionCard = memo(function ExamQuestionCard({ question, index, selected, disabled, onChoose, children }: {
  question: Question; index: number; selected: string[]; disabled?: boolean;
  onChoose: (letter: string) => void; children?: ReactNode;
}) {
  const s = useThemedStyles(styles);
  const { fontScale } = useWindowDimensions();
  const edge = Math.ceil(36 * Math.max(1, fontScale));
  return <View style={s.card}>
    {!!question.sharedStem && <Text style={s.sharedStem}>{question.sharedStem}</Text>}
    <Text style={s.question}>{index + 1}. {question.question}</Text>
    <QuestionImages question={question} />
    {Object.entries(question.options).map(([letter, text]) => <AnimatedPressable key={letter}
      accessibilityRole={question.type === 'multiple_choice' ? 'checkbox' : 'radio'}
      accessibilityLabel={letter + '，' + text} accessibilityState={{ checked: selected.includes(letter), disabled: !!disabled }}
      disabled={disabled} onPress={() => onChoose(letter)} style={[s.option, selected.includes(letter) && s.selected]}>
      <View style={[s.badge, { width: edge, height: edge, borderRadius: edge / 2 }, selected.includes(letter) && s.badgeSelected]}>
        <Text style={[s.letter, selected.includes(letter) && s.letterSelected]}>{letter}</Text>
      </View><Text style={s.optionText}>{text}</Text>
    </AnimatedPressable>)}
    {children}
  </View>;
});

export function ExamAnswerGrid({ items, onChoose }: { items: { id: string; answered: boolean; current?: boolean; disabled?: boolean }[]; onChoose: (index: number) => void }) {
  const s = useThemedStyles(styles);
  return <View style={s.grid}>{items.map((item, index) => <AnimatedPressable key={item.id}
    accessibilityRole="button" accessibilityLabel={`第${index + 1}题，${item.answered ? '已答' : '未答'}`}
    accessibilityState={{ disabled: !!item.disabled, selected: !!item.current }} disabled={item.disabled}
    onPress={() => onChoose(index)} style={[s.cell, item.answered && s.cellAnswered, item.current && s.cellCurrent, item.disabled && { opacity: 0.45 }]}>
    <Text style={[s.cellText, item.answered && s.cellAnsweredText]}>{index + 1}</Text>
  </AnimatedPressable>)}</View>;
}
const styles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.surface, padding: 16, gap: 14, borderRadius: 15 },
  question: { color: c.text, fontSize: 19, lineHeight: 31, fontWeight: '700' },
  sharedStem: { color: c.textMuted, fontSize: 15, lineHeight: 26 },
  option: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 14, minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12 },
  selected: { borderColor: c.brand, backgroundColor: c.brandSoft },
  badge: { borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badgeSelected: { backgroundColor: c.action, borderColor: c.action },
  letter: { color: c.text, fontSize: 16, lineHeight: 22, textAlign: 'center', includeFontPadding: false },
  letterSelected: { color: '#FFFFFF' },
  optionText: { color: c.text, fontSize: 15, lineHeight: 25, flex: 1, minWidth: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 12 },
  cell: { minWidth: 48, minHeight: 48, borderRadius: 12, borderColor: c.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 10 },
  cellAnswered: { backgroundColor: c.action, borderColor: c.action },
  cellCurrent: { borderColor: c.brand, borderWidth: 2 },
  cellText: { color: c.text, fontSize: 16 }, cellAnsweredText: { color: '#FFFFFF' },
});
