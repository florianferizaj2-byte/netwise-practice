#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""四川专升本·计算机基础 补充题库构建器。

把 batches/ 目录下按知识点拆分的批次文件合并成 questions/supplement.json。

批次文件格式（JSON 数组），每题：
  {
    "point": "sc-1-1-1",          # 知识点编码，决定 chapter/section/point
    "type": "single_choice",      # single_choice | multiple_choice | true_false
    "q": "题干",
    "o": ["选项A", "选项B", "选项C", "选项D"],   # 判断题省略
    "a": "A",                     # 单选/判断为字符串；多选为 "ABD"
    "x": "解析",
    "d": "easy"                   # easy | medium | hard
  }

用法：
  python scripts/build-sichuan-supplement.py            # 构建
  python scripts/build-sichuan-supplement.py --check    # 只校验配额，不写文件
"""

import argparse
import json
import pathlib
import sys
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parents[1]
CERT_DIR = ROOT / "server" / "question-banks" / "sichuan-upgrading-computer"
BATCH_DIR = ROOT / "scripts" / "sichuan-supplement-batches"
OUT = CERT_DIR / "questions" / "supplement.json"

TYPES = {"single_choice": "single_choice", "multiple_choice": "multiple_choice", "true_false": "true_false"}
DIFFICULTIES = {"easy", "medium", "hard"}


def load_manifest():
    manifest = json.loads((CERT_DIR / "manifest.json").read_text(encoding="utf-8"))
    points = {}
    for module in manifest["taxonomy"]["modules"]:
        for section in module["sections"]:
            for point in section["knowledgePoints"]:
                points[point["code"]] = {
                    "chapter": module["name"],
                    "section": section["name"],
                    "point": point["name"],
                }
    return manifest, points


def load_batches():
    """按文件名顺序读取所有批次。"""
    if not BATCH_DIR.exists():
        return {}
    batches = {}
    for path in sorted(BATCH_DIR.glob("*.json")):
        batches[path.name] = json.loads(path.read_text(encoding="utf-8"))
    return batches


def normalize_options(entry, code, seq):
    """把作者写的选项转成 A-D，并校验答题结构。

    重要：这里【不做】任何选项轮转。

    各批次在编写时已自行把正确答案均匀分散到 A/B/C/D（质检脚本会验证）。
    如果构建阶段再叠加一次轮转，会把这些精心设计过的分布重新打散甚至
    压回同一个字母，反而破坏均衡；而且轮转偏移一旦随题序变化，
    解析里以字母指代选项的表述就会失效。因此构建阶段保持原样，
    答案分布问题统一交给 check-sichuan-supplement-quality.py 把关。
    """
    qtype = entry["type"]
    if qtype == "true_false":
        return {"A": "正确", "B": "错误"}, [entry["a"]]
    options = entry["o"]
    if len(options) != 4:
        raise ValueError(f"{code}: 选择题必须有 4 个选项，实际 {len(options)}")
    answer = sorted(str(entry["a"]))
    if len(set(answer)) != len(answer):
        raise ValueError(f"{code}: 答案重复 {entry['a']}")
    if qtype == "single_choice" and len(answer) != 1:
        raise ValueError(f"{code}: 单选题答案必须唯一 {entry['a']}")
    if qtype == "multiple_choice" and len(answer) < 2:
        raise ValueError(f"{code}: 多选题至少两个答案 {entry['a']}")
    if any(letter not in "ABCD" for letter in answer):
        raise ValueError(f"{code}: 答案越界 {entry['a']}")
    mapping = dict(zip("ABCD", options))
    return mapping, answer


def build(check_only=False):
    manifest, points = load_manifest()
    batches = load_batches()

    questions = []
    seen_stems = set()
    per_point = Counter()
    errors = []

    for filename, rows in batches.items():
        for index, entry in enumerate(rows):
            where = f"{filename}[{index}]"
            code = entry.get("point")
            if code not in points:
                errors.append(f"{where}: 未知知识点编码 {code!r}")
                continue
            qtype = entry.get("type")
            if qtype not in TYPES:
                errors.append(f"{where}: 非法题型 {qtype!r}")
                continue
            if entry.get("d") not in DIFFICULTIES:
                errors.append(f"{where}: 非法难度 {entry.get('d')!r}")
                continue
            stem = str(entry.get("q", "")).strip()
            if len(stem) < 10:
                errors.append(f"{where}: 题干过短 -> {stem!r}")
                continue
            if stem in seen_stems:
                errors.append(f"{where}: 题干重复 -> {stem[:40]}")
                continue
            seen_stems.add(stem)
            analysis = str(entry.get("x", "")).strip()
            if len(analysis) < 12:
                errors.append(f"{where}: 解析过短")
                continue
            try:
                options, answer = normalize_options(entry, where, per_point[code])
            except ValueError as exc:
                errors.append(str(exc))
                continue

            location = points[code]
            questions.append({
                "id": f"sc-upgrading-supplement-{len(questions) + 1:04d}",
                "type": qtype,
                "question": stem,
                "options": options,
                "answer": answer,
                "analysis": analysis,
                "chapter": location["chapter"],
                "knowledgeSection": location["section"],
                "knowledgePoint": location["point"],
                "difficulty": entry["d"],
                "tags": ["四川专升本", "计算机基础", location["point"]],
            })
            per_point[code] += 1

    if errors:
        print(f"构建失败，{len(errors)} 项问题：")
        for message in errors[:40]:
            print(f"  x {message}")
        if len(errors) > 40:
            print(f"  ... 另有 {len(errors) - 40} 项")
        return 1

    # 配额核对
    quota = json.loads(
        (ROOT / "scripts" / "sichuan-upgrading-quota.json").read_text(encoding="utf-8")
    ) if (ROOT / "scripts" / "sichuan-upgrading-quota.json").exists() else {}

    print(f"批次 {len(batches)} 个，生成 {len(questions)} 题")
    print(f"  难度：{dict(Counter(q['difficulty'] for q in questions))}")
    print(f"  题型：{dict(Counter(q['type'] for q in questions))}")
    shortfall = False
    for code, expected in sorted(quota.items()):
        actual = per_point.get(code, 0)
        flag = "" if actual >= expected else "  <-- 不足"
        if actual < expected:
            shortfall = True
        name = points.get(code, {}).get("point", code)
        print(f"  {code} {name}: {actual}/{expected}{flag}")
    if shortfall:
        print("\n提示：存在未达配额的批次，尚未生成文件。")
        if check_only:
            return 1
    if check_only:
        return 0 if not shortfall else 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n已写入 {OUT.relative_to(ROOT)}")
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    return build(check_only=args.check)


if __name__ == "__main__":
    sys.exit(main())
