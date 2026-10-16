import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from '../components/SafeArea';
import { AppAlert } from '../components/AppAlert';
import { AppSwitch } from '../components/AppSwitch';
import { AnimatedPressable } from '../components/Motion';
import { mobileApi, type AdminAnnouncement, type AdminUser, type AdminUserPage, type AuthResponse } from '../api/client';
import { publicAnnouncements } from '../announcements/current';
import { useScreenActive } from '../navigation/ScreenActivity';
import { useThemedStyles, type ThemeColors } from '../theme';

type Props = { user: AuthResponse['user']; certificates: AuthResponse['certificates']; onClose: () => void; onUserUpdated?: (user: AuthResponse['user']) => void };
const plans = { free: '普通账号', vip: 'VIP', svip: 'SVIP', ssvip: 'SSVIP' } as const;
const formatDate = (date: string | null) => date ? new Date(date).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—';
const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试';
const dateInput = (value: string | null) => value ? new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }) : '';

export function AdminScreen({ user, certificates, onClose, onUserUpdated }: Props) {
  const s = useThemedStyles(styles);
  const active = useScreenActive();
  const alive = useRef(true);
  const requestNumber = useRef(0);
  const [tab, setTab] = useState<'users' | 'announcement'>('users');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'banned'>('all');
  const [page, setPage] = useState<AdminUserPage | null>(null);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [nickname, setNickname] = useState('');
  const [certificateId, setCertificateId] = useState<string | null>(null);
  const [pickingCertificate, setPickingCertificate] = useState(false);
  const [plan, setPlan] = useState<AdminUser['membershipPlan']>('free');
  const [expires, setExpires] = useState('');
  const [banReason, setBanReason] = useState('');
  const [announcement, setAnnouncement] = useState<AdminAnnouncement | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => () => { alive.current = false; requestNumber.current += 1; }, []);
  useEffect(() => { if (active && user.isAdmin) void loadUsers(); }, [active, user.id]);
  if (!user.isAdmin) return null;

  async function loadUsers(filter = status, offset = 0) {
    const revision = ++requestNumber.current;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await mobileApi.adminUsers(search.trim(), filter, offset);
      if (alive.current && revision === requestNumber.current) {
        setPage((previous) => offset && previous ? { ...result, users: [...previous.users, ...result.users] } : result);
      }
    } catch (cause) { if (alive.current && revision === requestNumber.current) setError(errorText(cause)); }
    finally { if (alive.current && revision === requestNumber.current) setBusy(false); }
  }
  function fillUser(value: AdminUser) {
    setSelected(value); setNickname(value.communityName || ''); setCertificateId(value.certificateId);
    setPlan(value.membershipPlan); setExpires(value.membershipPlan === 'free' ? '' : dateInput(value.membershipExpiresAt));
    setBanReason(value.banReason || ''); setPickingCertificate(false);
  }
  async function loadUser(id: string) {
    setBusy(true); setError(''); setNotice('');
    try { const result = await mobileApi.adminUser(id); if (alive.current) fillUser(result.user); }
    catch (cause) { if (alive.current) setError(errorText(cause)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function saveUser() {
    if (!selected || busy) return;
    let membershipExpiresAt: string | null = null;
    if (plan !== 'free' && expires.trim()) {
      const date = expires.trim();
      const value = Date.parse(`${date}T23:59:59+08:00`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value) || dateInput(new Date(value).toISOString()) !== date || value <= Date.now()) {
        setError('请填写未来的到期日期，例如 2027-10-14；留空表示长期有效。'); return;
      }
      membershipExpiresAt = new Date(value).toISOString();
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await mobileApi.adminSaveUser(selected.id, { revision: selected.revision, communityName: nickname.trim() || null,
        certificateId, membershipPlan: plan, membershipExpiresAt });
      if (!alive.current) return;
      fillUser(result.user); setNotice('账号设置已保存');
      setPage((previous) => previous ? { ...previous, users: previous.users.map((item) => item.id === result.user.id ? result.user : item) } : previous);
      if (result.user.id === user.id) onUserUpdated?.(result.user);
    } catch (cause) { if (alive.current) setError(errorText(cause)); }
    finally { if (alive.current) setBusy(false); }
  }
  function confirmBan() {
    if (!selected || selected.isAdmin || busy) return;
    const target = selected;
    const banned = !target.bannedAt;
    AppAlert.alert(banned ? '封禁账号' : '解除封禁', banned ? `确认封禁 ${target.username}？该账号会立即退出登录。` : `确认解除 ${target.username} 的封禁？`, [
      { text: '取消', style: 'cancel' },
      { text: banned ? '确认封禁' : '确认解封', style: banned ? 'destructive' : 'default', onPress: () => {
        setBusy(true); setError(''); setNotice('');
        void mobileApi.adminSetUserBanned(target.id, banned, banReason.trim()).then(() => mobileApi.adminUser(target.id))
          .then((result) => { if (alive.current) { fillUser(result.user); setNotice(banned ? '账号已封禁' : '账号已解封'); } })
          .catch((cause) => { if (alive.current) setError(errorText(cause)); })
          .finally(() => { if (alive.current) setBusy(false); });
      } },
    ]);
  }
  async function loadAnnouncement() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await mobileApi.adminAnnouncement();
      if (alive.current) { setAnnouncement(result); setTitle(result.announcement.title); setBody(result.announcement.body); setEnabled(result.announcement.enabled); }
    } catch (cause) { if (alive.current) setError(errorText(cause)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function saveAnnouncement() {
    if (!announcement || busy) return;
    if (!title.trim() || !body.trim()) { setError('请填写公告标题和正文'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await mobileApi.adminSaveAnnouncement({ revision: announcement.revision, enabled, title: title.trim(), body: body.trim() });
      if (alive.current) { setAnnouncement(result); setNotice(enabled ? '公告已保存，首页将显示最新内容' : '公告已隐藏'); }
      void publicAnnouncements.refresh(true);
    } catch (cause) { if (alive.current) setError(errorText(cause)); }
    finally { if (alive.current) setBusy(false); }
  }
  const certificateName = (id: string | null) => certificates.find((item) => item.id === id)?.name || '未选择题库';
  const button = (label: string, action: () => void, primary = false, disabled = busy) => (
    <AnimatedPressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={action}
      style={[s.button, primary && s.primaryButton, disabled && s.disabled]}>
      <Text style={[s.buttonText, primary && s.primaryText]}>{label}</Text>
    </AnimatedPressable>
  );
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <Text accessibilityRole="header" style={s.heading}>管理中心</Text>
          {button('返回我的', onClose, false, false)}
        </View>
        <View style={s.tabs}>
          {(['users', 'announcement'] as const).map((key) => <AnimatedPressable key={key} accessibilityRole="button"
            accessibilityState={{ selected: tab === key }} disabled={busy} onPress={() => {
              setTab(key); setSelected(null); setError(''); setNotice('');
              if (key === 'announcement') void loadAnnouncement(); else void loadUsers();
            }} style={[s.tab, tab === key && s.activeTab]}>
            <Text style={[s.tabText, tab === key && s.activeText]}>{key === 'users' ? '账号管理' : '公告管理'}</Text>
          </AnimatedPressable>)}
        </View>
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
        {busy && <ActivityIndicator style={s.loading} accessibilityLabel="正在处理" />}
        {tab === 'users' && !selected ? <>
          <View style={s.search}>
            <TextInput accessibilityLabel="搜索账号或昵称" placeholder="搜索账号或昵称" value={search} maxLength={100}
              onChangeText={setSearch} onSubmitEditing={() => void loadUsers()} style={[s.input, s.searchInput]} />
            {button('搜索', () => void loadUsers())}
          </View>
          <View style={[s.filters, s.filterBar]}>{(['all', 'active', 'banned'] as const).map((filter) =>
            <AnimatedPressable key={filter} accessibilityRole="button" disabled={busy} accessibilityState={{ selected: status === filter }}
              onPress={() => { setStatus(filter); void loadUsers(filter); }} style={[s.choice, status === filter && s.activeTab]}>
              <Text style={s.tabText}>{filter === 'all' ? '全部账号' : filter === 'active' ? '正常账号' : '封禁账号'}</Text>
            </AnimatedPressable>)}</View>
          <Text style={s.total}>共 {page?.total ?? '—'} 个注册账号</Text>
          <FlatList data={page?.users || []} keyExtractor={(item) => item.id} contentContainerStyle={s.list}
            keyboardShouldPersistTaps="handled" renderItem={({ item }) => <AnimatedPressable accessibilityRole="button"
              accessibilityLabel={`查看账号 ${item.username}`} disabled={busy} onPress={() => void loadUser(item.id)} style={s.userCard}>
              <View style={s.row}><Text style={s.userName}>{item.username}</Text><Text style={s.meta}>{item.isAdmin ? '管理员' : item.bannedAt ? '已封禁' : '正常'}</Text></View>
              <Text style={s.meta}>注册：{formatDate(item.createdAt)}</Text>
              <Text style={s.meta}>{plans[item.membershipPlan]} · {certificateName(item.certificateId)}</Text>
              {!!item.communityName && <Text style={s.meta}>昵称：{item.communityName}</Text>}
            </AnimatedPressable>}
            ListEmptyComponent={!busy ? <Text style={s.meta}>没有符合条件的账号</Text> : null}
            ListFooterComponent={page?.nextOffset != null ? button('加载更多账号', () => void loadUsers(status, page.nextOffset!)) : null} />
        </> : tab === 'users' && selected ? <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
          {button('返回账号列表', () => { setSelected(null); void loadUsers(); })}
          <Text style={s.userName}>{selected.username}</Text>
          <Text selectable style={s.meta}>账号 ID：{selected.id}</Text>
          <Text style={s.meta}>注册：{formatDate(selected.createdAt)}</Text>
          <Text style={s.meta}>状态：{selected.isAdmin ? '管理员' : selected.bannedAt ? '已封禁' : '正常'}</Text>
          <Text style={s.label}>社区昵称</Text>
          <TextInput accessibilityLabel="社区昵称" editable={!busy} placeholder="留空使用账号名" value={nickname} maxLength={24} onChangeText={setNickname} style={s.input} />
          <Text style={s.label}>考试题库</Text>
          {button(`选择题库：${certificateName(certificateId)}`, () => setPickingCertificate(!pickingCertificate))}
          {pickingCertificate && <View style={s.options}>{[{ id: '', name: '未选择题库' }, ...certificates].map((item) =>
            <AnimatedPressable key={item.id} accessibilityRole="button" disabled={busy} onPress={() => { setCertificateId(item.id || null); setPickingCertificate(false); }}
              style={[s.button, item.id === certificateId && s.activeTab]}><Text style={s.buttonText}>{item.name}</Text></AnimatedPressable>)}</View>}
          <Text style={s.label}>会员等级</Text>
          <View style={s.filters}>{(Object.keys(plans) as Array<AdminUser['membershipPlan']>).map((value) =>
            <AnimatedPressable key={value} accessibilityRole="button" disabled={busy} accessibilityState={{ selected: plan === value }} onPress={() => setPlan(value)}
              style={[s.choice, plan === value && s.activeTab]}><Text style={s.tabText}>{plans[value]}</Text></AnimatedPressable>)}</View>
          {plan !== 'free' && <><Text style={s.label}>会员到期日期</Text><TextInput accessibilityLabel="会员到期日期" editable={!busy} placeholder="YYYY-MM-DD" value={expires}
            maxLength={10} onChangeText={setExpires} style={s.input} /><Text style={s.meta}>留空表示长期有效，日期按北京时间计算。</Text></>}
          {button('保存账号设置', () => void saveUser(), true)}
          {button('读取最新账号信息', () => void loadUser(selected.id))}
          {!selected.isAdmin && <><Text style={s.label}>封禁原因（选填）</Text><TextInput accessibilityLabel="封禁原因" value={banReason} onChangeText={setBanReason} maxLength={200}
            style={s.input} placeholder="填写封禁原因" />{button(selected.bannedAt ? '解除封禁' : '封禁账号', confirmBan)}</>}
        </ScrollView> : <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
          <View style={s.row}><Text style={s.label}>在首页显示公告</Text><AppSwitch accessibilityLabel="在首页显示公告" value={enabled} onValueChange={setEnabled} disabled={busy || !announcement} /></View>
          <Text style={s.label}>公告标题</Text><TextInput accessibilityLabel="公告标题" editable={!busy} placeholder="输入公告标题" value={title} onChangeText={setTitle} maxLength={80} style={s.input} />
          <Text style={s.label}>公告正文</Text><TextInput accessibilityLabel="公告正文" editable={!busy} placeholder="输入公告正文" value={body} onChangeText={setBody} maxLength={8000}
            multiline textAlignVertical="top" style={[s.input, s.bodyInput]} />
          <Text style={s.meta}>保存后直接更新公告，无需重新安装。其他用户回到首页时会读取最新内容。</Text>
          {button('保存公告', () => void saveAnnouncement(), true, busy || !announcement)}
          {button('读取最新公告', () => void loadAnnouncement())}
          {!!announcement && <Text style={s.meta}>上次更新：{formatDate(announcement.announcement.updatedAt)}</Text>}
        </ScrollView>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = (c: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, gap: 12 },
  heading: { color: c.text, fontSize: 22, fontWeight: '700' }, tabs: { flexDirection: 'row', paddingHorizontal: 20, gap: 12 },
  tab: { flex: 1, padding: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: c.surface },
  tabText: { color: c.text, fontSize: 15, fontWeight: '600' }, activeTab: { backgroundColor: c.brandSoft }, activeText: { color: c.brandDark },
  button: { paddingHorizontal: 16, paddingVertical: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  buttonText: { color: c.text, fontSize: 15, lineHeight: 23 }, primaryButton: { backgroundColor: c.brandSoft, borderColor: c.brandSoft }, primaryText: { color: c.brandDark, fontWeight: '700' }, disabled: { opacity: 0.5 },
  search: { flexDirection: 'row', paddingHorizontal: 20, marginTop: 16, gap: 8, alignItems: 'center' }, searchInput: { flex: 1, minWidth: 0 },
  input: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, minHeight: 48, padding: 12, color: c.text, fontSize: 16, lineHeight: 24 },
  filters: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', paddingHorizontal: 0 }, filterBar: { marginHorizontal: 20 }, choice: { padding: 12, minHeight: 44, borderRadius: 10, backgroundColor: c.surface },
  total: { paddingHorizontal: 20, paddingVertical: 12, color: c.textMuted, fontSize: 14 }, list: { padding: 20, paddingTop: 0, gap: 12, paddingBottom: 32 },
  userCard: { padding: 16, borderRadius: 16, backgroundColor: c.surface, gap: 8 }, userName: { color: c.text, fontWeight: '700', fontSize: 18, lineHeight: 27, flexShrink: 1 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'space-between' }, meta: { color: c.textMuted, fontSize: 14, lineHeight: 22 },
  form: { padding: 20, gap: 12, paddingBottom: 40 }, label: { color: c.text, fontSize: 16, fontWeight: '600', lineHeight: 25 }, options: { gap: 8 },
  bodyInput: { minHeight: 220 }, error: { color: c.warning, paddingHorizontal: 20, paddingVertical: 12, fontSize: 15, lineHeight: 23 },
  notice: { color: c.success, paddingHorizontal: 20, paddingVertical: 12, fontSize: 15, lineHeight: 23 }, loading: { padding: 12 },
});
