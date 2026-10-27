import {Text,View} from 'react-native';
import {practiceAttemptSync,usePracticeAttemptSync} from '../api/practiceAttemptSync.android';
import {AnimatedPressable} from './Motion';
import {useTheme} from '../theme';
export function PracticeSyncNotice(){
 const state=usePracticeAttemptSync(),{colors}=useTheme();
 const failed=state.entries.filter(entry=>entry.status!=='saved'&&entry.error);if(!state.owner||!failed.length)return null;
 return <View testID="practice-sync-notice" style={{paddingHorizontal:16,paddingVertical:8,backgroundColor:colors.warningSoft,flexDirection:'row',alignItems:'center',gap:8}}><Text accessibilityLiveRegion="polite" style={{flex:1,color:colors.warning,fontSize:14,lineHeight:22}}>{state.ready?`有 ${failed.length} 条答题记录尚未同步，请点击重试。`:'本机待同步记录暂时无法读取，请重试；此前记录未被删除。'}</Text><AnimatedPressable accessibilityRole="button" accessibilityLabel="重试同步待保存的答题记录" onPress={()=>practiceAttemptSync.retry()} style={{minHeight:48,paddingHorizontal:8,justifyContent:'center'}}><Text style={{color:colors.brand,fontSize:14}}>重试</Text></AnimatedPressable></View>;
}
