import { AppIcon } from '../components/AppIcon';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { mobileApi, type AuthResponse } from '../api/client';
import { AnimatedPressable } from '../components/Motion';
import { SafeAreaView } from '../components/SafeArea';
import { prepareAvatarImage } from '../platform/avatarImage';
import { openPermissionSettings, requestPhotoAccess } from '../permissions/photos';
import { useThemedStyles, useTheme, type ThemeColors } from '../theme';

type Props = { user: AuthResponse['user']; onSaved: (user: AuthResponse['user']) => void; onCancel?: () => void; onLogout?: () => void };
type Avatar = { uri: string; data: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' };
export function ProfileSetupScreen({ user, onSaved, onCancel, onLogout }: Props) {
  const { colors } = useTheme();
  const s = useThemedStyles(styles);
  const [name, setName] = useState(user.communityName || '');
  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const avatarUri = avatar?.uri || (user.avatarUrl ? mobileApi.resolveDownloadUrl(user.avatarUrl) : undefined);

  async function choose() {
    if (choosing || saving) return;
    setChoosing(true); setError(''); setDenied(false);
    try {
      if (Platform.OS === 'android' && !await requestPhotoAccess()) {
        // The system picker can grant access to a single chosen photo even
        // when the user declines broad library access.
        setDenied(true);
      }
      if (Platform.OS === 'ios' && !(await ImagePicker.requestMediaLibraryPermissionsAsync()).granted) {
        setDenied(true); setError('请允许访问相册后选择头像'); return;
      }
      // Safari's picker must be opened from the tap, before any asynchronous work.
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], legacy: false, allowsEditing: Platform.OS !== 'web', aspect: [1, 1], quality: 0.65, base64: true });
      if (result.canceled || !result.assets[0]) return;
      const image = await prepareAvatarImage(result.assets[0]);
      if (!image.base64) throw new Error('照片读取失败，请重新选择');
      if (Math.ceil(image.base64.length * 3 / 4) > 2 * 1024 * 1024) throw new Error('头像不能超过 2 MB，请裁剪或选择较小的照片');
      const mime = image.mimeType || 'image/jpeg';
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('请选择 JPG、PNG 或 WebP 照片');
      setAvatar({ uri: image.uri, data: image.base64, mimeType: mime as Avatar['mimeType'] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法选择头像，请重试'); }
    finally { setChoosing(false); }
  }
  async function save() {
    if (saving || choosing) return;
    if (!name.trim()) { setError('请填写名字'); return; }
    if (!avatar && !user.avatarUrl) { setError('请选择头像'); return; }
    setSaving(true); setError('');
    try {
      const result = await mobileApi.saveProfile({ name: name.trim(), ...(avatar ? { image: { data: avatar.data, mimeType: avatar.mimeType } } : {}) });
      onSaved(result.user);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '资料保存失败，请重试'); }
    finally { setSaving(false); }
  }
  return <SafeAreaView style={s.safe}><KeyboardAvoidingView style={s.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.nativeHeader}>{onCancel&&<AnimatedPressable accessibilityRole="button" accessibilityLabel="返回我的" onPress={onCancel} disabled={saving} style={s.back}><AppIcon name="chevron-left" size={23} color={colors.text}/></AnimatedPressable>}<Text accessibilityRole="header" style={s.title}>{onCancel?'个人资料':'完善个人资料'}</Text></View><View style={s.card}>
        
        <Text style={s.hint}>{onCancel ? '名字和头像随账号保存。' : '填写名字并选择头像后，继续学习。'}</Text>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="选择头像" accessibilityState={{ disabled: choosing || saving, busy: choosing }} disabled={choosing || saving} onPress={() => void choose()} style={s.avatarButton}>
          {avatarUri ? <Image source={{ uri: avatarUri }} style={s.avatar} /> : <View style={s.avatar}><Text style={s.placeholder}>头像</Text></View>}
          <Text style={s.link}>{choosing ? '正在选择…' : '选择头像'}</Text>
        </AnimatedPressable>
        <Text style={s.label}>名字</Text>
        <TextInput accessibilityLabel="名字" value={name} onChangeText={setName} maxLength={24} editable={!saving} style={s.input} placeholder="输入你的名字或昵称" placeholderTextColor={colors.textFaint} returnKeyType="done" onSubmitEditing={() => void save()} />
        <Text style={s.hint}>最多 24 个字，头像支持 JPG、PNG 或 WebP。</Text>
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        {denied && Platform.OS !== 'web' && <AnimatedPressable accessibilityRole="button" onPress={() => { void openPermissionSettings().catch(() => setError('无法打开设置，请从手机设置中管理相册权限')); }} style={s.secondary}><Text style={s.link}>打开手机权限设置</Text></AnimatedPressable>}
        <AnimatedPressable accessibilityRole="button" accessibilityLabel={onCancel ? '保存资料' : '保存并继续'} accessibilityState={{ disabled: saving || choosing, busy: saving }} disabled={saving || choosing} onPress={() => void save()} style={[s.primary, (saving || choosing) && s.disabled]}><Text style={s.primaryText}>{saving ? '正在保存…' : onCancel ? '保存资料' : '保存并继续'}</Text></AnimatedPressable>
        {(onCancel || onLogout) && <AnimatedPressable accessibilityRole="button" disabled={saving} onPress={onCancel || onLogout} style={s.secondary}><Text style={s.link}>{onCancel ? '取消' : '退出账号'}</Text></AnimatedPressable>}
      </View>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
const baseStyles = (c: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background }, content: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: c.surface, borderRadius: 24, padding: 24, gap: 12, width: '100%', maxWidth: 480, alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: c.text }, hint: { fontSize: 14, lineHeight: 22, color: c.textMuted },
  avatarButton: { alignSelf: 'center', alignItems: 'center', padding: 12, gap: 12 }, avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, placeholder: { fontSize: 20, color: c.textMuted },
  label: { fontSize: 16, fontWeight: '600', color: c.text }, input: { minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, color: c.text, fontSize: 16 },
  primary: { minHeight: 48, borderRadius: 14, backgroundColor: c.brand, justifyContent: 'center', alignItems: 'center', paddingVertical: 14, marginTop: 4 }, primaryText: { color: c.white, fontSize: 16, fontWeight: '700' }, secondary: { minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center' }, link: { color: c.brand, fontSize: 16, fontWeight: '600' }, error: { color: c.warning, fontSize: 14, lineHeight: 22 }, disabled: { opacity: 0.5 },
});

const styles=(c:ThemeColors)=>({...baseStyles(c),...StyleSheet.create({content:{flexGrow:1,padding:16,paddingBottom:28},nativeHeader:{flexDirection:'row',alignItems:'center',gap:8,minHeight:56,marginBottom:16},back:{width:48,minHeight:48,justifyContent:'center',alignItems:'center'},title:{fontSize:20,color:c.text,fontWeight:'700'},card:{backgroundColor:c.surface,borderColor:c.border,borderWidth:StyleSheet.hairlineWidth,borderRadius:15,padding:20,gap:16,width:'100%',maxWidth:560,alignSelf:'center'},avatarButton:{alignSelf:'center',alignItems:'center',padding:12,gap:12,marginVertical:8},avatar:{width:92,height:92,borderRadius:46,backgroundColor:c.brandSoft,alignItems:'center',justifyContent:'center'},input:{color:c.text,fontSize:15,minHeight:52,padding:14,borderColor:c.border,borderWidth:1,borderRadius:10,backgroundColor:c.background},primary:{backgroundColor:c.action,minHeight:50,borderRadius:12,justifyContent:'center',alignItems:'center',marginTop:10}})});
