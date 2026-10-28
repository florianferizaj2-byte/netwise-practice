import { SafeAreaView } from '../components/SafeArea';
import { AppIcon } from '../components/AppIcon';
import { iosStyles } from '../iosStyles';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { mobileApi, type AuthResponse } from '../api/client';
import { AnimatedPressable, EntranceView } from '../components/Motion';
import { radius, shadow, spacing, useThemedStyles, type ThemeColors } from '../theme';

type CertificateScreenProps = {
  certificates: AuthResponse['certificates'];
  currentCertificateId?: string | null;
  onCancel?: () => void;
  onSelected: (user: AuthResponse['user']) => void;
};

export function CertificateScreen({
  certificates,
  currentCertificateId,
  onCancel,
  onSelected,
}: CertificateScreenProps) {
  const styles = useThemedStyles(createStyles, iosStyles.certificate);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [selectedId,setSelectedId]=useState(currentCertificateId||'');
  const [search,setSearch]=useState('');
  const choosing=useRef(false);

  async function choose(certificateId: string) {
    if(choosing.current)return;
    choosing.current=true;
    setBusyId(certificateId);
    setError('');
    try {
      const result = await mobileApi.selectCertificate(certificateId);
      onSelected(result.user);
    } catch {
      setError('备考目标选择失败，请检查服务器连接');
    } finally {
      setBusyId(null);choosing.current=false;
    }
  }

  return (
    <SafeAreaView style={styles.nativeScreen}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {onCancel && (
        <AnimatedPressable
          accessibilityLabel="返回我的"
          accessibilityRole="button"
          onPress={onCancel}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹ 返回我的</Text>
        </AnimatedPressable>
      )}
      <EntranceView distance={12} style={styles.hero}>
        <Text style={styles.kicker}>先确定学习目标</Text>
        <Text style={styles.title}>{onCancel ? '切换考试证书' : '选择考试证书'}</Text>
        <Text style={styles.subtitle}>
          {onCancel
            ? '切换后会同步对应题库、学习计划和错题记录。'
            : '之后可以在“我的”里切换，学习记录会跟随账号同步。'}
        </Text>
      </EntranceView>

      <View style={styles.search}><AppIcon name="search" size={18} color={styles.meta.color}/><TextInput accessibilityLabel="搜索考试证书" value={search} onChangeText={setSearch} placeholder="搜索考试证书" placeholderTextColor={styles.meta.color} style={styles.searchInput}/>{!!search&&<AnimatedPressable accessibilityRole="button" accessibilityLabel="清除证书搜索" onPress={()=>setSearch('')} style={styles.searchClear}><AppIcon name="close" size={17} color={styles.meta.color}/></AnimatedPressable>}</View>
      <View style={styles.list}>
        {certificates.filter(c=>c.name.toLowerCase().includes(search.trim().toLowerCase())).map((certificate, index) => {
          const selected = certificate.id === selectedId;
          return (
            <EntranceView
              delay={80 + index * 55}
              distance={14}
              key={certificate.id}
            >
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={certificate.name}
                accessibilityState={{ selected, disabled: !!busyId, busy: busyId === certificate.id }}
                disabled={!!busyId}
                onPress={() => setSelectedId(certificate.id)}
                style={[styles.certificateCard, selected && styles.selectedCertificateCard]}
              >
                <View style={styles.badge}>
                  <AppIcon name="book" size={23} color={styles.badgeText.color}/>
                </View>
                <View style={styles.copy}>
                  <Text style={styles.name}>{certificate.name}</Text>
                  {!!certificate.description && <Text style={styles.meta}>{certificate.description}</Text>}
                  <Text style={styles.meta}>
                    {certificate.id===currentCertificateId
                      ? '当前正在学习'
                      : busyId === certificate.id
                        ? '正在准备题库…'
                        : '进入对应题库和学习计划'}
                  </Text>
                </View>
                <AppIcon style={styles.arrow}>{selected ? '✓' : '›'}</AppIcon>
              </AnimatedPressable>
            </EntranceView>
          );
        })}
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}
      {!certificates.some(c=>c.name.toLowerCase().includes(search.trim().toLowerCase()))&&<Text style={styles.meta}>未找到匹配的证书，试试其他关键词。</Text>}
    </ScrollView><View style={styles.nativeFooter}><Text style={styles.meta}>切换只展示对应证书的记录，已有学习进度和错题会保留。</Text><AnimatedPressable accessibilityRole="button" accessibilityLabel="确认选择考试证书" disabled={!selectedId||!!busyId} onPress={()=>{if(selectedId===currentCertificateId&&onCancel)onCancel();else void choose(selectedId)}} style={[styles.nativeConfirm,(!selectedId||!!busyId)&&{opacity:0.5}]}><Text style={styles.nativeConfirmText}>{busyId?'正在准备题库…':selectedId===currentCertificateId?'保持当前证书':'确认切换'}</Text></AnimatedPressable></View></SafeAreaView>
  );
}

const baseCreateStyles = (colors: ThemeColors) => StyleSheet.create({
  content: {
    backgroundColor: colors.background,
    flexGrow: 1,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  hero: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
    paddingTop: spacing.lg,
  },
  kicker: {
    color: colors.brand,
    fontSize: 14,
    fontWeight: '800',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 38,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 24,
  },
  list: {
    gap: spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
  },
  backText: {
    color: colors.brand,
    fontSize: 15,
    fontWeight: '800',
  },
  certificateCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 82,
    padding: spacing.md,
    ...shadow.card,
  },
  selectedCertificateCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.brand,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
    borderRadius: radius.sm,
    height: 48,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 48,
  },
  badgeText: {
    color: colors.brand,
    fontSize: 22,
    fontWeight: '800',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  arrow: {
    color: colors.brand,
    fontSize: 29,
    marginLeft: spacing.sm,
  },
  error: {
    color: colors.warning,
    fontSize: 14,
    lineHeight: 22,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});

const createStyles=(c:ThemeColors)=>({...baseCreateStyles(c),...StyleSheet.create({nativeScreen:{flex:1,backgroundColor:c.background},content:{padding:16,paddingTop:8,paddingBottom:24},backButton:{minHeight:48,justifyContent:'center'},backText:{fontSize:14,color:c.textMuted},hero:{paddingVertical:16,gap:8,marginBottom:10},kicker:{display:'none'},title:{fontSize:25,color:c.text,fontWeight:'700'},subtitle:{fontSize:14,color:c.textMuted,lineHeight:23},search:{flexDirection:'row',alignItems:'center',backgroundColor:c.surface,borderColor:c.border,borderWidth:1,borderRadius:12,paddingLeft:14,marginBottom:16,gap:9},searchInput:{fontSize:14,color:c.text,flex:1,minHeight:50,paddingVertical:12},searchClear:{width:48,minHeight:48,alignItems:'center',justifyContent:'center'},list:{gap:10},certificateCard:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:c.surface,borderColor:c.border,borderWidth:1,borderRadius:14,padding:16,minHeight:90},selectedCertificateCard:{borderColor:c.brand,backgroundColor:c.brandSoft},badge:{backgroundColor:c.brandSoft,width:44,height:44,borderRadius:12,alignItems:'center',justifyContent:'center'},badgeText:{color:c.brand,fontSize:22},name:{color:c.text,fontSize:16,fontWeight:'700'},meta:{color:c.textMuted,fontSize:12,lineHeight:20},nativeFooter:{backgroundColor:c.surface,padding:16,gap:12,borderTopColor:c.border,borderTopWidth:StyleSheet.hairlineWidth},nativeConfirm:{backgroundColor:c.action,borderRadius:12,minHeight:50,alignItems:'center',justifyContent:'center'},nativeConfirmText:{fontSize:15,color:'#FFFFFF',fontWeight:'700'}})});
