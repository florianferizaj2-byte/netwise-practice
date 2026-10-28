import { useEffect, useRef, useState } from 'react';
import {
  mobileApi,
  type AiQuestionGenerationSelection,
  type AiQuestionGenerationJob,
  type AiQuestionGroup,
  type AiQuestionGroupResponse,
} from '../api/client';
import { useScreenActive } from '../navigation/ScreenActivity';
import type { AppTab, NavigationOptions } from '../types';

/** Shared job/group lifecycle; the native presentation does not replace billing or ownership checks. */
export function useAiQuestionDraft({
  selection,
  initialGroupId,
  onNavigate,
}: {
  selection?: AiQuestionGenerationSelection;
  initialGroupId?: string;
  onNavigate: (tab: AppTab, options?: NavigationOptions) => void;
}) {
  const screenActive = useScreenActive();
  const [groups, setGroups] = useState<AiQuestionGroup[]>([]);
  const [jobs, setJobs] = useState<AiQuestionGenerationJob[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState(initialGroupId || '');
  const [groupDetail, setGroupDetail] =
    useState<AiQuestionGroupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'generate' | 'upload' | ''>('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const mountedRef = useRef(true),
    actionLock = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!screenActive) return;
    let mounted = true;
    let firstLoad = true,
      refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const [allGroups, jobResult] = await Promise.all([
          mobileApi.aiQuestionGroups(),
          mobileApi.aiQuestionGenerationJobs(),
        ]);
        if (!mounted) return;
        const matchingGroups = allGroups.filter(
          (group) =>
            group.groupType === 'question_generation' &&
            (!selection ||
              (group.metadata.chapter === selection.chapter &&
                (group.metadata.knowledgeSection || '') ===
                  (selection.knowledgeSection || '') &&
                group.metadata.knowledgePoint === selection.knowledgePoint)),
        );
        setGroups(matchingGroups);
        setJobs(
          jobResult.jobs.filter(
            (job) =>
              !selection ||
              (job.selection.chapter === selection.chapter &&
                (job.selection.knowledgeSection || '') ===
                  (selection.knowledgeSection || '') &&
                job.selection.knowledgePoint === selection.knowledgePoint),
          ),
        );
        if (selectedGroupId) {
          const detail = await mobileApi.aiQuestionGroup(selectedGroupId);
          if (mounted) setGroupDetail(detail);
        } else {
          setGroupDetail(null);
        }
        if (mounted && firstLoad) setError('');
      } catch (cause: unknown) {
        if (mounted && firstLoad)
          setError(
            cause instanceof Error ? cause.message : '题组加载失败，请稍后重试',
          );
      } finally {
        refreshing = false;
        if (mounted && firstLoad) {
          firstLoad = false;
          setLoading(false);
        }
      }
    };
    setLoading(true);
    void refresh();
    const timer = setInterval(() => void refresh(), 3500);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [
    screenActive,
    selectedGroupId,
    selection?.chapter,
    selection?.knowledgeSection,
    selection?.knowledgePoint,
    reloadKey,
  ]);

  const activeJob = jobs.find(
    (job) => job.status === 'queued' || job.status === 'running',
  );
  const latestJob = jobs[0];
  const failedJob = latestJob?.status === 'failed' ? latestJob : undefined;
  const group = groupDetail?.group;

  async function startGeneration() {
    if (!selection || actionLock.current || activeJob || loading) return;
    actionLock.current = true;
    setBusy('generate');
    setError('');
    setNotice('');
    try {
      const result = await mobileApi.createAiQuestionGeneration(selection);
      if (!mountedRef.current) return;
      setJobs((current) => [
        result.job,
        ...current.filter((job) => job.id !== result.job.id),
      ]);
      setNotice('任务已交给服务器后台运行。你可以切换到其他页面继续刷题。');
    } catch (cause: unknown) {
      if (mountedRef.current)
        setError(
          cause instanceof Error ? cause.message : '任务创建失败，请稍后重试',
        );
    } finally {
      actionLock.current = false;
      if (mountedRef.current) setBusy('');
    }
  }

  async function setGroupSharing(target: AiQuestionGroup, shared: boolean) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy('upload');
    setError('');
    setNotice('');
    try {
      const result = await mobileApi.shareAiQuestionGroup(target.id, shared);
      if (!mountedRef.current) return;
      setGroupDetail((current) =>
        current
          ? { ...current, group: { ...current.group, shared: result.shared } }
          : current,
      );
      setGroups((current) =>
        current.map((item) =>
          item.id === target.id ? { ...item, shared: result.shared } : item,
        ),
      );
      setNotice(
        result.shared
          ? '题组已上传到共享 AI 题组。'
          : '题组已取消共享，仍可在你的账号中刷题。',
      );
    } catch (cause: unknown) {
      if (mountedRef.current)
        setError(
          cause instanceof Error ? cause.message : '题组上传失败，请稍后重试',
        );
    } finally {
      actionLock.current = false;
      if (mountedRef.current) setBusy('');
    }
  }

  async function uploadGroup() {
    if (!group) return;
    await setGroupSharing(group, !group.shared);
  }

  function practiceGroup(target: AiQuestionGroup) {
    onNavigate('practice', {
      practiceMode: 'sequential',
      practiceSource: 'all',
      practiceChapter: target.metadata.chapter,
      practiceKnowledgeSection: target.metadata.knowledgeSection,
      practiceKnowledgePoint: target.metadata.knowledgePoint,
      practiceSelectionComplete: true,
      practiceAiGroupId: target.id,
    });
  }

  const selectGroup = (id: string) => {
    setNotice('');
    setError('');
    setGroupDetail(null);
    setSelectedGroupId(id);
  };
  return {
    groups,
    jobs,
    selectedGroupId,
    groupDetail,
    loading,
    busy,
    notice,
    error,
    activeJob,
    failedJob,
    latestJob,
    group,
    startGeneration,
    setGroupSharing,
    uploadGroup,
    practiceGroup,
    setGroupDetail,
    setSelectedGroupId,
    selectGroup,
    refresh: () => setReloadKey((value) => value + 1),
  };
}
export type AiQuestionDraftState = ReturnType<typeof useAiQuestionDraft>;
