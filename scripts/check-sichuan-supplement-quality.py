#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""四川专升本补充题库：答案分布与内容质量体检。

在做人工/子代理逐题审核之前，先用这个脚本做机械体检，
把明显的问题（答案分布失衡、选项长度异常、题干过短、
答案位置与实际内容不匹配的常见模式）挑出来。

用法：
  python scripts/check-sichuan-supplement-quality.py
  python scripts/check-sichuan-supplement-quality.py --file <路径>
"""

import argparse
import json
import pathlib
import re
import sys
from collections import Counter, defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[1]
CERT_DIR = ROOT / "server" / "question-banks" / "sichuan-upgrading-computer"
BATCH_DIR = ROOT / "scripts" / "sichuan-supplement-batches"

# 常见"绝对化"措辞：出现在选项里往往提示该选项可被排除，
# 也常被命题人当作错误项使用，这里只做提示不做阻断。
ABSOLUTE = re.compile(r"完全|全部|一定|必然|绝不|任何情况|所有情况|绝对|永远|只(?:能|有|是)")


def load_entries(paths):
    entries = []
    for path in paths:
        data = json.loads(path.read_text(encoding="utf-8"))
        for index, row in enumerate(data):
            entries.append((path.name, index, row))
    return entries


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", action="append", default=None)
    args = parser.parse_args()

    if args.file:
        paths = [pathlib.Path(f) for f in args.file]
    else:
        paths = sorted(BATCH_DIR.glob("*.json"))
    paths = [p for p in paths if p.exists()]
    if not paths:
        print("没有找到批次文件")
        return 1

    entries = load_entries(paths)
    print(f"体检 {len(paths)} 个批次文件，共 {len(entries)} 题\n")

    # 1. 单选答案位置分布（按知识点）
    single_by_point = defaultdict(Counter)
    for _, _, row in entries:
        if row.get("type") == "single_choice":
            single_by_point[row["point"]][row["a"]] += 1

    print("单选答案位置分布：")
    unbalanced = []
    for point in sorted(single_by_point):
        counter = single_by_point[point]
        total = sum(counter.values())
        parts = " ".join(f"{k}:{counter.get(k, 0)}({counter.get(k, 0) * 100 // max(total, 1)}%)" for k in "ABCD")
        # 任一字母占比超过 40% 或低于 10% 视为失衡
        skewed = [k for k in "ABCD" if counter.get(k, 0) / max(total, 1) > 0.40 or counter.get(k, 0) / max(total, 1) < 0.10]
        flag = "  <-- 分布失衡 " + ",".join(skewed) if total >= 12 and skewed else ""
        if flag:
            unbalanced.append(point)
        print(f"  {point} (n={total}): {parts}{flag}")

    # 2. 多选答案长度分布
    print("\n多选题答案个数分布：")
    multi = Counter()
    for _, _, row in entries:
        if row.get("type") == "multiple_choice":
            multi[len(str(row["a"]))] += 1
    for count in sorted(multi):
        print(f"  {count} 个答案: {multi[count]} 题")

    # 3. 判断题正误分布
    print("\n判断题正误分布：")
    tf = Counter()
    for _, _, row in entries:
        if row.get("type") == "true_false":
            tf["正确(A)" if row["a"] == "A" else "错误(B)"] += 1
    for key, value in tf.items():
        print(f"  {key}: {value} 题")
    if tf and sum(tf.values()) >= 20:
        ratio = tf.get("正确(A)", 0) / sum(tf.values())
        if ratio > 0.7 or ratio < 0.3:
            print(f"  <-- 正误比例失衡，正确占比 {ratio:.0%}")

    # 4. 选项长度差异：正确答案明显长于干扰项，是命题质量隐患
    print("\n选项长度异常（正确答案长度显著超过干扰项平均长度 2.2 倍以上）：")
    flagged = 0
    for filename, index, row in entries:
        if row.get("type") != "single_choice":
            continue
        options = row.get("o") or []
        if len(options) != 4:
            continue
        answer = row["a"]
        correct_index = "ABCD".index(answer)
        correct_len = len(options[correct_index])
        others = [len(o) for i, o in enumerate(options) if i != correct_index]
        avg_other = sum(others) / len(others) if others else 0
        if avg_other and correct_len > avg_other * 2.2 and correct_len > 18:
            flagged += 1
            if flagged <= 12:
                print(f"  {filename}[{index}]: 正确项 {correct_len} 字 vs 其余均值 {avg_other:.1f} 字")
    if not flagged:
        print("  无")

    # 5. 绝对化措辞出现在正确选项中的情况（可能是命题疏忽）
    print("\n绝对化措辞出现在【正确】选项中的单选题：")
    flagged2 = 0
    for filename, index, row in entries:
        if row.get("type") != "single_choice":
            continue
        options = row.get("o") or []
        if len(options) != 4:
            continue
        correct = options["ABCD".index(row["a"])]
        if ABSOLUTE.search(correct):
            flagged2 += 1
            if flagged2 <= 12:
                print(f"  {filename}[{index}]: {correct[:40]}")
    if not flagged2:
        print("  无")

    # 6. 题干重复（跨批次）
    print("\n跨批次题干重复：")
    stems = Counter()
    for _, _, row in entries:
        stems[str(row.get("q", "")).strip()] += 1
    dupes = [(s, c) for s, c in stems.items() if c > 1]
    if dupes:
        for stem, count in dupes[:15]:
            print(f"  {count} 次: {stem[:50]}")
    else:
        print("  无")

    # 7. 解析过短
    print("\n解析偏短（少于 20 字）：")
    short = [
        (f, i) for f, i, row in entries if len(str(row.get("x", ""))) < 20
    ]
    if short:
        for filename, index in short[:15]:
            print(f"  {filename}[{index}]")
    else:
        print("  无")

    return 0


if __name__ == "__main__":
    sys.exit(main())
