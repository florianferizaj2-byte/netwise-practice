import {useMemo,useState} from 'react';
import {Modal,ScrollView,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {AndroidModalSafeArea} from '../components/AndroidModalSafeArea.android';
import {AppIcon} from '../components/AppIcon';
import {AnimatedPressable} from '../components/Motion';
import {androidAccent} from '../android-design-tokens';
import {LaunchLogo} from '../launch/LaunchSurface';
import {useAndroidFocusMode} from '../navigation/AndroidFocusMode.android';
import {useScreenActive} from '../navigation/ScreenActivity';
import {useTheme,type ThemeColors} from '../theme';
import {APP_VERSION} from '../version';
import {NOTO_SANS_SC_LICENSE} from '../legal/notoSansLicense';

type Props={visible:boolean;onClose:()=>void;onSponsor:()=>void};
export function AboutScreen({visible,onClose,onSponsor}:Props){
  const active=useScreenActive(),{colors,reduceMotion}=useTheme();
  useAndroidFocusMode(visible&&active,onClose);
  return <Modal visible={visible&&active} statusBarTranslucent navigationBarTranslucent animationType={reduceMotion?'none':'slide'} onRequestClose={onClose}>
    <AndroidModalSafeArea style={{backgroundColor:colors.background}}>
      {visible&&active&&<AboutContent onClose={onClose} onSponsor={onSponsor}/>}
    </AndroidModalSafeArea>
  </Modal>;
}
function AboutContent({onClose,onSponsor}:Omit<Props,'visible'>){
  const {colors}=useTheme(),s=useMemo(()=>styles(colors),[colors]),{width,fontScale}=useWindowDimensions();
  const [letterOpen,setLetterOpen]=useState(false),[licenseOpen,setLicenseOpen]=useState(false),[versionOpen,setVersionOpen]=useState(false);
  const stacked=width<360||fontScale>1.2;
  return <View style={s.page} testID="android-about-screen">
    <View style={s.header}>
      <AnimatedPressable accessibilityRole="button" accessibilityLabel="关闭关于考匠" onPress={onClose} style={s.headerButton}><AppIcon name="chevron-left" size={24} color={colors.text}/></AnimatedPressable>
      <Text accessibilityRole="header" style={s.pageTitle}>关于考匠</Text><View style={s.headerPlaceholder}/>
    </View>
    <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.hero}>
        <LaunchLogo size={80}/><Text style={s.brandTitle}>考匠 · AceExam</Text>
        <View style={s.versionPill}><Text style={s.versionText}>移动端 v{APP_VERSION}</Text></View>
        <Text style={s.tagline}>让学习回到每个人手里</Text>
        <Text style={s.intro}>把精练题、碎片时间与 AI 学习放在一起。</Text>
      </View>
      <View style={s.card} testID="about-author-card">
        <View style={s.cardHeading}><View style={[s.iconTile,{backgroundColor:androidAccent(colors,'member').soft}]}><AppIcon name="pen" size={23} color={androidAccent(colors,'member').ink}/></View><Text accessibilityRole="header" style={s.sectionTitle}>作者想说</Text></View>
        <Text style={s.body}>每一个认真学习的人，都应该拥有一条不被费用和时间挡住的路。</Text>
        <Text style={s.body}>普通题库免费开放，AI 服务按积分使用。</Text>
        {letterOpen&&<View testID="about-full-letter" style={s.expandedCopy}>
          <Text style={s.body}>我做考匠，起初只是因为相信：</Text>
          <Text style={s.body}>每一个认真学习的人，都应该拥有一条不被费用和时间挡住的路。</Text>
          <Text style={s.body}>我希望，让暂时无力承担学费的同学，也能接触到经过整理、真正精练有用的题目；让没有时间参加补课的同学，也能利用通勤、排队和睡前的碎片时间，一点点向前进步；让每个人都能体验到更现代、更贴近自己的 AI 教育。</Text>
          <Text style={s.body}>普通题库继续免费开放。AI 服务由作者统一提供，按账号积分使用，可通过每日签到或会员获取积分。</Text>
          <Text style={s.body}>如果考匠对你有帮助，欢迎打赏一笔小小的支持，帮助我们持续维护题库、改进体验，让考匠社区越来越好。</Text>
          <Text style={s.body}>愿每一次短暂练习，都能变成看得见的进步。感谢你把时间交给考匠。</Text>
        </View>}
        <AnimatedPressable accessibilityRole="button" accessibilityLabel={letterOpen?'收起完整寄语':'阅读完整寄语'} accessibilityState={{expanded:letterOpen}} onPress={()=>setLetterOpen(!letterOpen)} style={s.disclosure}>
          <Text style={s.link}>{letterOpen?'收起完整寄语':'阅读完整寄语'}</Text><AppIcon name={letterOpen?'chevron-up':'chevron-down'} size={17} color={colors.brand}/>
        </AnimatedPressable>
      </View>
      <View style={s.group}>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="字体与开源许可" accessibilityState={{expanded:licenseOpen}} onPress={()=>setLicenseOpen(!licenseOpen)} style={s.settingsRow}>
          <View style={[s.iconTile,{backgroundColor:androidAccent(colors,'progress').soft}]}><AppIcon name="document" size={23} color={androidAccent(colors,'progress').ink}/></View>
          <View style={s.rowCopy}><Text style={s.rowTitle}>字体与开源许可</Text><Text style={s.meta}>Noto Sans SC · SIL OFL 1.1</Text></View>
          <AppIcon name={licenseOpen?'chevron-up':'chevron-right'} size={18} color={colors.textMuted}/>
        </AnimatedPressable>
        {licenseOpen&&<View testID="about-font-license" style={s.licenseContent}><Text selectable style={s.license}>{NOTO_SANS_SC_LICENSE}</Text></View>}
        <View style={s.divider}/>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="版本信息" accessibilityState={{expanded:versionOpen}} onPress={()=>setVersionOpen(!versionOpen)} style={s.settingsRow}>
          <View style={[s.iconTile,{backgroundColor:colors.brandSoft}]}><AppIcon name="info" size={23} color={colors.brand}/></View>
          <View style={[s.versionRow,stacked&&s.versionStack]}><Text style={s.rowTitle}>版本信息</Text><Text style={s.meta}>v{APP_VERSION}</Text></View>
          <AppIcon name={versionOpen?'chevron-up':'chevron-right'} size={18} color={colors.textMuted}/>
        </AnimatedPressable>
        {versionOpen&&<Text testID="about-version-details" style={s.versionDetails}>考匠 Android 客户端 · 当前安装版本 v{APP_VERSION}</Text>}
      </View>
      <View testID="about-support-card" style={[s.support,stacked&&s.supportStack]}>
        <View style={s.supportCopy}><View style={[s.iconTile,{backgroundColor:androidAccent(colors,'review').soft}]}><AppIcon name="heart" size={24} color={androidAccent(colors,'review').ink}/></View>
          <View style={s.rowCopy}><Text style={s.rowTitle}>喜欢考匠，就支持一下</Text><Text style={s.meta}>帮助维护题库和改进体验</Text></View>
        </View>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="关于页赞助作者" onPress={onSponsor} style={[s.supportButton,stacked&&s.supportButtonWide]}><Text style={s.supportText}>赞助作者</Text></AnimatedPressable>
      </View>
      <Text style={s.footnote}>愿每次短暂练习，都变成看得见的进步。</Text>
    </ScrollView>
  </View>;
}
const font={fontFamily:'KaojiangSans',includeFontPadding:false};
const styles=(c:ThemeColors)=>StyleSheet.create({
  page:{flex:1,backgroundColor:c.background},scroll:{flexGrow:1,flexShrink:1,flexBasis:0,minHeight:0},
  header:{minHeight:56,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:8},headerButton:{width:48,minHeight:48,alignItems:'center',justifyContent:'center'},headerPlaceholder:{width:48},
  pageTitle:{...font,flex:1,textAlign:'center',fontSize:20,lineHeight:29,fontWeight:'700',color:c.text},
  content:{padding:16,paddingTop:8,paddingBottom:24,gap:14},hero:{alignItems:'center',paddingTop:8,paddingBottom:8,gap:10},
  brandTitle:{...font,color:c.text,fontSize:22,lineHeight:31,fontWeight:'700',textAlign:'center'},versionPill:{backgroundColor:c.brandSoft,paddingHorizontal:12,paddingVertical:4,borderRadius:12},versionText:{...font,color:c.brand,fontSize:14,lineHeight:21,fontWeight:'500'},
  tagline:{...font,color:c.text,fontSize:20,lineHeight:30,fontWeight:'700',marginTop:8,textAlign:'center'},intro:{...font,color:c.textMuted,fontSize:16,lineHeight:25,textAlign:'center'},
  card:{backgroundColor:c.surface,borderRadius:24,padding:16,gap:14},cardHeading:{flexDirection:'row',alignItems:'center',gap:12},iconTile:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center',flexShrink:0},sectionTitle:{...font,color:c.text,fontSize:18,lineHeight:27,fontWeight:'700',flexShrink:1},
  body:{...font,color:c.text,fontSize:16,lineHeight:25,fontWeight:'400'},expandedCopy:{gap:14,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:c.border,paddingTop:14},disclosure:{minHeight:48,paddingTop:6,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:c.border,flexDirection:'row',alignItems:'center',gap:8},link:{...font,color:c.brand,fontSize:15,lineHeight:23,fontWeight:'500',flexShrink:1},
  group:{backgroundColor:c.surface,borderRadius:24,paddingHorizontal:16},settingsRow:{minHeight:72,flexDirection:'row',alignItems:'center',gap:12,paddingVertical:12},rowCopy:{flex:1,minWidth:0,gap:3},rowTitle:{...font,color:c.text,fontSize:16,lineHeight:25,fontWeight:'500'},meta:{...font,color:c.textMuted,fontSize:14,lineHeight:22},divider:{height:StyleSheet.hairlineWidth,backgroundColor:c.border},
  versionRow:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},versionStack:{flexDirection:'column',alignItems:'flex-start',gap:3},versionDetails:{...font,color:c.textMuted,fontSize:15,lineHeight:24,paddingBottom:16},licenseContent:{paddingBottom:16},license:{...font,color:c.textMuted,fontSize:14,lineHeight:23},
  support:{backgroundColor:c.surface,borderRadius:24,padding:16,flexDirection:'row',alignItems:'center',gap:12},supportStack:{flexDirection:'column',alignItems:'stretch'},supportCopy:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:12},supportButton:{minHeight:48,paddingHorizontal:16,paddingVertical:12,borderRadius:16,backgroundColor:c.action,alignItems:'center',justifyContent:'center'},supportButtonWide:{alignSelf:'stretch'},supportText:{...font,fontSize:15,lineHeight:23,fontWeight:'500',color:c.white},footnote:{...font,color:c.textMuted,fontSize:14,lineHeight:22,textAlign:'center',paddingVertical:2},
});
