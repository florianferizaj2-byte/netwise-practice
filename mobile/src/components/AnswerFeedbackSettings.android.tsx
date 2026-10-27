import {VoicePackDownloads} from './VoicePackDownloads.android';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { AppIcon } from './AppIcon';
import { AppSwitch } from './AppSwitch';
import { AnimatedPressable } from './Motion';
import { playCorrectAnswerFeedback } from '../answerFeedback';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';

const volumes = [{label:'静音',value:0},{label:'轻声',value:0.16},{label:'适中',value:0.32},{label:'清晰',value:0.56}];
const tones = [{label:'轻柔',value:'soft'},{label:'清脆',value:'crisp'},{label:'温暖',value:'warm'}] as const;
const strengths = [{label:'轻',value:'light'},{label:'中',value:'normal'},{label:'明显',value:'strong'}] as const;
export function AnswerFeedbackSettings() {
  const {colors,answerFeedbackSettings:settings,answerFeedbackReady:ready,setAnswerFeedbackSettings:update} = useTheme();
  const s = useThemedStyles(styles);
  const {width,fontScale} = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.2;
  function choices<T extends string | number>(name:string, options:ReadonlyArray<{label:string;value:T}>, value:T, select:(value:T)=>void) {
    return <View accessibilityRole="radiogroup" accessibilityLabel={name} style={s.segments}>
      {options.map(option=><AnimatedPressable key={option.value} disabled={!ready} accessibilityRole="radio" accessibilityLabel={`${name}：${option.label}`} accessibilityState={{checked:option.value===value,disabled:!ready}} onPress={()=>select(option.value)} style={[s.segment,options.length===4&&compact&&{flexBasis:"40%"},option.value===value&&s.selected]}><Text style={[s.option,option.value===value&&s.selectedText]}>{option.label}</Text></AnimatedPressable>)}
    </View>;
  }
  return <View style={s.card} testID="answer-feedback-settings">
    <View style={s.heading}><AppIcon name="check" size={22} color={colors.brand}/><Text style={s.title}>答对反馈</Text></View>
    <Text style={s.hint}>答对时，给自己一个小小的肯定</Text>
    <View style={s.row}><View style={s.copy}><Text style={s.label}>答对提示音</Text><Text style={s.description}>控制入场、答对、连对与连错声音，与按钮音效分开</Text></View><View style={s.switch}><AppSwitch hitSlop={10} accessibilityLabel="答对提示音" disabled={!ready} value={settings.soundEnabled} onValueChange={soundEnabled=>update({soundEnabled})} trackColor={{false:colors.border,true:colors.action}} thumbColor={colors.white}/></View></View>
    <VoicePackDownloads/>
    <Text style={s.label}>内置兜底音色</Text>
    {choices('答对提示音音色',tones,settings.style,style=>update({style}))}
    <View style={s.row}><Text style={s.label}>提示音音量</Text><Text style={s.hint}>{Math.round(settings.volume*100)}%</Text></View>
    {choices('答对提示音音量',volumes,settings.volume,volume=>update({volume}))}
    <View style={s.divider}/>
    <View style={s.row}><View style={s.copy}><Text style={s.label}>答对震动</Text><Text style={s.description}>轻短确认，不连续震动</Text></View><View style={s.switch}><AppSwitch hitSlop={10} accessibilityLabel="答对震动" disabled={!ready} value={settings.hapticsEnabled} onValueChange={hapticsEnabled=>update({hapticsEnabled})} trackColor={{false:colors.border,true:colors.action}} thumbColor={colors.white}/></View></View>
    <Text style={s.label}>震动强度</Text>
    {choices('答对震动强度',strengths,settings.hapticStrength,hapticStrength=>update({hapticStrength}))}
    <AnimatedPressable accessibilityRole="button" accessibilityLabel="体验答对反馈" disabled={!ready||(!settings.hapticsEnabled&&(!settings.soundEnabled||settings.volume===0))} onPress={()=>playCorrectAnswerFeedback(true)} style={s.preview}><AppIcon name="play" size={18} color={colors.brand}/><Text style={s.previewText}>体验一下</Text></AnimatedPressable>
    <Text style={s.description}>音量同时受手机媒体音量控制。震动通过轻短时长区分，实际手感因机型与系统设置而异。</Text>
  </View>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({
  switch:{minHeight:48,minWidth:52,alignItems:'center',justifyContent:'center'},card:{backgroundColor:c.surface,borderRadius:15,padding:16,gap:12},heading:{flexDirection:'row',alignItems:'center',gap:8},title:{fontSize:18,lineHeight:27,fontWeight:'700',color:c.text},hint:{fontSize:13,lineHeight:20,color:c.textMuted},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:14,minHeight:48},copy:{flex:1,gap:5},label:{fontSize:15,lineHeight:23,fontWeight:'500',color:c.text},description:{fontSize:13,lineHeight:21,color:c.textMuted},divider:{height:StyleSheet.hairlineWidth,backgroundColor:c.border,marginVertical:3},segments:{flexDirection:'row',flexWrap:'wrap',gap:6},segment:{minHeight:48,minWidth:60,flexGrow:1,flexBasis:60,paddingHorizontal:12,paddingVertical:11,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:c.surfaceMuted},selected:{backgroundColor:c.action},option:{fontSize:14,lineHeight:22,color:c.textMuted,textAlign:'center'},selectedText:{color:c.white,fontWeight:'700'},preview:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,backgroundColor:c.brandSoft,borderRadius:12,padding:12},previewText:{color:c.brand,fontSize:15,lineHeight:23,fontWeight:'500'},
});
