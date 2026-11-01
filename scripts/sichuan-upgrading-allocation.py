#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""四川专升本·计算机基础题库扩充配额表。

按考纲权重把总题量 1100 分配到 7 个模块、22 个知识点，
减去现有题量得到每个知识点的新增配额。

用法：
  python scripts/sichuan-upgrading-allocation.py          # 打印配额表
  python scripts/sichuan-upgrading-allocation.py --json   # 输出配额 JSON
"""

import argparse
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
CERT_DIR = ROOT / "server" / "question-banks" / "sichuan-upgrading-computer"

TOTAL_TARGET = 1100

# 现有 206 题的章节分布（由 loader 统计得到，用于计算缺口）
EXISTING_BY_MODULE = {
    "计算机基础知识": 42,
    "计算机软硬件基础": 42,
    "办公自动化": 75,
    "网络与信息安全": 21,
    "算法与程序设计": 14,
    "数据库技术": 5,
    "计算机新技术": 7,
}


def build_plan():
    manifest = json.loads((CERT_DIR / "manifest.json").read_text(encoding="utf-8"))
    taxonomy = {m["name"]: m for m in manifest["taxonomy"]["modules"]}

    plan = []
    for module in manifest["syllabus"]["modules"]:
        name = module["name"]
        target = round(TOTAL_TARGET * module["weight"] / 100)
        need = target - EXISTING_BY_MODULE[name]
        sections = taxonomy[name]["sections"]

        # 该模块下所有知识点，按大纲顺序
        points = []
        for section in sections:
            for point in section["knowledgePoints"]:
                points.append((section["name"], point["name"], point["code"]))

        # 按知识点平均分配缺口，余数依次补给前面的知识点，保证合计精确
        base, extra = divmod(need, len(points))
        allocations = []
        for index, (section_name, point_name, code) in enumerate(points):
            quota = base + (1 if index < extra else 0)
            allocations.append({
                "section": section_name,
                "point": point_name,
                "code": code,
                "quota": quota,
            })

        plan.append({
            "module": name,
            "weight": module["weight"],
            "targetTotal": target,
            "existing": EXISTING_BY_MODULE[name],
            "needed": need,
            "allocations": allocations,
        })
    return plan


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    plan = build_plan()

    if args.json:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return

    grand_needed = 0
    grand_target = 0
    for entry in plan:
        grand_needed += entry["needed"]
        grand_target += entry["targetTotal"]
        print(f"{entry['module']}（权重 {entry['weight']}%，目标 {entry['targetTotal']}，现有 {entry['existing']}，新增 {entry['needed']}）")
        for allocation in entry["allocations"]:
            print(f"    {allocation['section']} / {allocation['point']}: {allocation['quota']}")
    print(f"\n合计：目标 {grand_target} 题，新增 {grand_needed} 题，现有 206 题，最终 {grand_target} 题")


if __name__ == "__main__":
    main()
