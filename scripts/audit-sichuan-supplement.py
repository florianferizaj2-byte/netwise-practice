#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""四川专升本补充题库：查重 + 结构审核。

用法：
  python scripts/audit-sichuan-supplement.py                     # 审核 supplement.json
  python scripts/audit-sichuan-supplement.py --file q.json ...   # 审核指定文件
  python scripts/audit-sichuan-supplement.py --similar 0.82      # 调整相似度阈值

检查项：
  1. 必填字段、题型、选项数、答案数与题型一致。
  2. 单选/多选必须有 A-D；判断题固定 A=正确、B=错误 且答案唯一。
  3. chapter / knowledgeSection / knowledgePoint 必须在 manifest.taxonomy 中。
  4. 解析不能过短，也不能只是"答案是 X"。
  5. ID 全局唯一（与整个题库所有 JSON 比对）。
  6. 题干查重：完全重复、归一化重复、以及 n-gram 相似度超阈值。
"""

import argparse
import json
import pathlib
import re
import sys
from collections import Counter, defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[1]
CERT_DIR = ROOT / "server" / "question-banks" / "sichuan-upgrading-computer"
BANKS_ROOT = ROOT / "server" / "question-banks"

DIFFICULTIES = {"easy", "medium", "hard"}
TYPES = {"single_choice", "multiple_choice", "true_false"}

# 归一化：去掉空白、标点、全角差异，只留中文/字母/数字
_PUNCT = re.compile(r"""[\s，。、；：？！""''（）《》【】,.;:?!()<>\[\]{}\-_—/\\|~`@#$%^&*+=]""")
_CJK = re.compile(r"[\u4e00-\u9fff]")


def normalize(text):
    text = str(text)
    text = _PUNCT.sub("", text)
    return text.lower()


def ngrams(text, n=3):
    text = normalize(text)
    if len(text) < n:
        return {text} if text else set()
    return {text[i:i + n] for i in range(len(text) - n + 1)}


def jaccard(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def load_taxonomy():
    manifest = json.loads((CERT_DIR / "manifest.json").read_text(encoding="utf-8"))
    paths = set()
    for module in manifest["taxonomy"]["modules"]:
        for section in module["sections"]:
            for point in section["knowledgePoints"]:
                paths.add((module["name"], section["name"], point["name"]))
    chapters = {m["name"] for m in manifest["syllabus"]["modules"]}
    return paths, chapters


def load_everything_else(target_files):
    """加载除目标文件外的所有题库 JSON，用于 ID 与题干查重。"""
    target = {p.resolve() for p in target_files}
    rows = []
    for path in BANKS_ROOT.rglob("*.json"):
        if path.resolve() in target:
            continue
        if path.name == "manifest.json":
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(data, list):
            continue
        for row in data:
            if isinstance(row, dict) and row.get("question"):
                rows.append((path, row))
    return rows


def audit(files, similar_threshold, quiet=False):
    paths, chapters = load_taxonomy()
    errors = []
    warnings = []

    questions = []
    for path in files:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            errors.append(f"{path.name}: 顶层必须是数组")
            continue
        for index, row in enumerate(data):
            where = f"{path.name}[{index}] id={row.get('id', '?')}"
            questions.append((path, row, where))

    # 1-4 单题结构
    for path, row, where in questions:
        qtype = row.get("type")
        if qtype not in TYPES:
            errors.append(f"{where}: 非法题型 {qtype!r}")
            continue
        options = row.get("options")
        answer = row.get("answer")
        if not isinstance(options, dict):
            errors.append(f"{where}: options 必须是对象")
            continue
        if not isinstance(answer, list) or not answer:
            errors.append(f"{where}: answer 必须是非空数组")
            continue

        if qtype == "true_false":
            if set(options) != {"A", "B"} or options.get("A") != "正确" or options.get("B") != "错误":
                errors.append(f"{where}: 判断题选项必须是 A=正确、B=错误")
            if answer not in (["A"], ["B"]):
                errors.append(f"{where}: 判断题答案必须是 ['A'] 或 ['B']")
        else:
            missing = [k for k in "ABCD" if k not in options]
            if missing:
                errors.append(f"{where}: 缺少选项 {missing}")
            if len(options) > 5:
                errors.append(f"{where}: 选项超过 5 个")
            if len(set(answer)) != len(answer):
                errors.append(f"{where}: 答案有重复项")
            if any(k not in options for k in answer):
                errors.append(f"{where}: 答案 {answer} 不在选项中")
            if qtype == "single_choice" and len(answer) != 1:
                errors.append(f"{where}: 单选题答案必须唯一，实际 {answer}")
            if qtype == "multiple_choice" and len(answer) < 2:
                errors.append(f"{where}: 多选题至少两个答案，实际 {answer}")
            # 选项内容不应重复。注意：这里必须按原文逐字比较。
            # 像「A、a、9」与「a、A、9」这类选项是为了考查排序，
            # 字符集合相同但顺序不同，属于完全合法的不同选项，
            # 用归一化或排序后的集合去比会误判为重复。
            texts = [str(options[k]).strip() for k in sorted(options)]
            if len(set(texts)) != len(texts):
                errors.append(f"{where}: 选项内容存在重复")

        stem = str(row.get("question", ""))
        if len(stem) < 10:
            errors.append(f"{where}: 题干过短")
        analysis = str(row.get("analysis", ""))
        if len(analysis) < 12:
            errors.append(f"{where}: 解析过短")
        if re.fullmatch(r"[^。]*答案[是为：:]\s*[A-E][。.]?", analysis):
            errors.append(f"{where}: 解析只写了答案，缺少推理")

        key = (row.get("chapter"), row.get("knowledgeSection"), row.get("knowledgePoint"))
        if key not in paths:
            errors.append(f"{where}: 知识分类不在标准目录中 -> {key}")
        if row.get("chapter") not in chapters:
            errors.append(f"{where}: 章节不在大纲中 -> {row.get('chapter')}")
        if row.get("difficulty") not in DIFFICULTIES:
            errors.append(f"{where}: 非法难度 {row.get('difficulty')!r}")
        tags = row.get("tags")
        if not isinstance(tags, list) or not tags:
            errors.append(f"{where}: tags 必须是非空数组")
        elif len(tags) > 12:
            errors.append(f"{where}: tags 超过 12 个")
        if not str(row.get("id", "")).strip():
            errors.append(f"{where}: 缺少 id")

    # 5. ID 唯一性（含全仓库其他题库）
    others = load_everything_else(files)
    other_ids = Counter(row["id"] for _, row in others if row.get("id"))
    local_ids = Counter(row["id"] for _, row, _ in questions if row.get("id"))
    for qid, count in local_ids.items():
        if count > 1:
            errors.append(f"ID 在本批内重复 {count} 次：{qid}")
        if other_ids.get(qid):
            errors.append(f"ID 与已有题库冲突：{qid}")

    # 6. 题干查重
    # 6a. 与本批之外的题库比对
    external = []
    for path, row in others:
        external.append((row.get("question", ""), row.get("id"), path.name))
    index_ngram = defaultdict(list)
    for stem, qid, src in external:
        for gram in ngrams(stem):
            index_ngram[gram].append((stem, qid, src))

    for path, row, where in questions:
        stem = row.get("question", "")
        norm = normalize(stem)
        best = None
        for other_stem, other_id, src in external:
            if normalize(other_stem) == norm:
                errors.append(f"{where}: 题干与已有题完全重复 -> {other_id} ({src})")
                best = None
                break
            score = jaccard(ngrams(stem), ngrams(other_stem))
            if best is None or score > best[0]:
                best = (score, other_id, src, other_stem)
        else:
            if best and best[0] >= similar_threshold:
                warnings.append(
                    f"{where}: 与已有题相似度 {best[0]:.2f} -> {best[1]} ({best[2]})：{best[3][:40]}"
                )

    # 6b. 本批内部两两比对（用倒排索引避免 O(n^2) 全量）
    local = [(row.get("question", ""), row.get("id"), where) for _, row, where in questions]
    grams = [ngrams(stem) for stem, _, _ in local]
    inverted = defaultdict(list)
    for i, gramset in enumerate(grams):
        for gram in gramset:
            inverted[gram].append(i)
    seen_pairs = set()
    for i, gramset in enumerate(grams):
        candidates = Counter()
        for gram in gramset:
            for j in inverted[gram]:
                if j != i:
                    candidates[j] += 1
        for j, _ in candidates.most_common(8):
            pair = (min(i, j), max(i, j))
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            score = jaccard(gramset, grams[j])
            if normalize(local[i][0]) == normalize(local[j][0]):
                errors.append(f"{local[i][2]}: 本批题干完全重复 -> {local[j][1]}")
            elif score >= similar_threshold:
                warnings.append(
                    f"{local[i][2]}: 与本批 {local[j][1]} 相似度 {score:.2f}：{local[j][0][:40]}"
                )

    # 统计
    by_point = Counter()
    by_type = Counter()
    by_difficulty = Counter()
    for _, row, _ in questions:
        by_point[(row.get("chapter"), row.get("knowledgePoint"))] += 1
        by_type[row.get("type")] += 1
        by_difficulty[row.get("difficulty")] += 1

    if not quiet:
        print(f"审核 {len(files)} 个文件，共 {len(questions)} 题")
        print(f"  题型：{dict(by_type)}")
        print(f"  难度：{dict(by_difficulty)}")
        print("  知识点分布：")
        for (chapter, point), count in sorted(by_point.items()):
            print(f"    {chapter} / {point}: {count}")

    if warnings:
        print(f"\n相似度警告 {len(warnings)} 条（阈值 {similar_threshold}）：")
        for message in warnings[:40]:
            print(f"  ! {message}")
        if len(warnings) > 40:
            print(f"  ... 另有 {len(warnings) - 40} 条")

    if errors:
        print(f"\n错误 {len(errors)} 条：")
        for message in errors[:60]:
            print(f"  x {message}")
        if len(errors) > 60:
            print(f"  ... 另有 {len(errors) - 60} 条")
        return 1

    print("\n结构审核通过，无错误。")
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", action="append", default=None)
    parser.add_argument("--similar", type=float, default=0.80)
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()

    if args.file:
        files = [pathlib.Path(f) for f in args.file]
    else:
        files = [CERT_DIR / "questions" / "supplement.json"]
    files = [f for f in files if f.exists()]
    if not files:
        print("没有找到要审核的文件")
        return 1
    return audit(files, args.similar, args.quiet)


if __name__ == "__main__":
    sys.exit(main())
