#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把某个批次文件里指定知识点的单选答案位置打散。

只对「正确答案集中在单一字母」的批次使用。做法是对每道单选题的选项
数组做一次整体轮转，使正确答案落到目标字母上，同时同步更新答案字母。

轮转不改变任何选项的文字内容，也不改变哪一项是正确答案——只是换了
选项的排列顺序，因此不影响题目正确性。

用法：
  python scripts/rebalance-answers.py <批次文件> <知识点编码>
"""

import json
import pathlib
import sys
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parents[1]


def rebalance(path: pathlib.Path, point: str):
    rows = json.loads(path.read_text(encoding="utf-8"))
    singles = [r for r in rows if r.get("point") == point and r.get("type") == "single_choice"]
    total = len(singles)
    if not total:
        print(f"{point}: 没有单选题")
        return 1

    before = Counter(r["a"] for r in singles)
    print(f"{point}: 调整前 {dict(sorted(before.items()))} (n={total})")

    # 目标：把答案尽量均匀铺到 ABCD
    # 顺序分配目标字母，使每个字母最多出现 ceil(total/4) 次
    targets = []
    order = "ABCD"
    # 优先补最少的字母，保证均衡
    counts = Counter()
    for index in range(total):
        # 选当前计数最少的字母，平局时按固定顺序
        best = min(order, key=lambda letter: (counts[letter], order.index(letter)))
        targets.append(best)
        counts[best] += 1

    cursor = 0
    for row in rows:
        if row.get("point") != point or row.get("type") != "single_choice":
            continue
        options = row["o"]
        current = "ABCD".index(row["a"])
        target = "ABCD".index(targets[cursor])
        cursor += 1
        if current == target:
            continue
        # 把正确项移动到 target 位置：其余选项保持相对顺序
        correct_text = options[current]
        rest = [options[i] for i in range(4) if i != current]
        new_options = rest[:target] + [correct_text] + rest[target:]
        row["o"] = new_options
        row["a"] = targets[cursor - 1]

    after = Counter(r["a"] for r in singles)
    print(f"{point}: 调整后 {dict(sorted(after.items()))}")
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已写回 {path.name}")
    return 0


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        return 1
    path = pathlib.Path(sys.argv[1])
    return rebalance(path, sys.argv[2])


if __name__ == "__main__":
    sys.exit(main())
