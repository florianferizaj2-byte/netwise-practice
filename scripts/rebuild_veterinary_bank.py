"""Rebuild the veterinary question bank: drop unusable / duplicate / redundant rows,
reclassify subjects by evidence from the source PDFs, then rebalance to the exam blueprint.

Usage:
    python scripts/rebuild_veterinary_bank.py analyze   # dry run, prints stats
    python scripts/rebuild_veterinary_bank.py apply     # writes files + archive
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / "server" / "question-banks" / "veterinary-practitioner"
QUESTIONS = BANK / "questions"
ARCHIVE = BANK / "archive"

BANK_DIRS = [
    "basic-subject",
    "preventive-subject",
    "clinical-subject",
    "comprehensive-subject",
    "mock-exams",
    "past-exams",
    "chapter-practice",
]

MODULES = ("基础科目", "预防科目", "临床科目", "综合科目")
# 综合科目真实可用上限约 680 题（病例题被 PDF 拆散后无法恢复），
# 四科统一到 900 只需补约 220 道，避免让近半题目变成机器生成内容。
CAP_PER_MODULE = 900

# 输出目录：按来源归并，避免出现“basic-subject 目录里装综合科目题”这种错位
SOURCE_GROUPS = {
    "basic-subject": "recent-exams",
    "preventive-subject": "recent-exams",
    "clinical-subject": "recent-exams",
    "comprehensive-subject": "recent-exams",
}
OUTPUT_DIRS = ("past-exams", "chapter-practice", "mock-exams", "recent-exams", "generated-2026")

# ---------------------------------------------------------------- detection

CASE_REF = re.compile(
    r"(该病|本病|该证|该患|该群|该例|该猪|该牛|该羊|该犬|该猫|该鸡|该鸭|该鹅|该兔|该马"
    r"|此病|上述|该病原|该寄生虫|该毒物|该菌|该病毒|该动物|该仔猪|该羔羊|该犊牛)"
)
MANGLED = re.compile(r"题共用(题干|选项)|共用题干|共用选项")
MERGED_OPTION = re.compile(r"[A-E][\.、．]")

SPECIES = {
    "猪病": re.compile(r"(猪|仔猪|母猪|育肥猪|种猪|断奶仔猪)"),
    "禽病": re.compile(r"(鸡|鸭|鹅|禽|雏鸡|蛋鸡|肉鸡|种鸡|鸽)"),
    "牛羊病": re.compile(r"(牛|羊|犊牛|羔羊|奶牛|肉牛|绵羊|山羊)"),
    "犬猫病": re.compile(r"(犬|猫|狗)"),
    "其他动物病": re.compile(r"(兔|马|貂|狐|鹿|骆驼|蜂|鱼|虾|鳖)"),
}

KEYWORDS = {
    "兽医法律法规和职业道德": (
        "《", "法》", "条例", "管理办法", "规范", "执业兽医", "主管部门", "农业农村部",
        "行政处罚", "备案", "检疫", "兽药经营", "注册", "处方笺", "职业道德",
        "法律责任", "动物防疫法", "动物诊疗", "许可证", "监督机构",
    ),
    "动物解剖学、组织学与胚胎学": (
        "解剖", "骨骼", "骨", "关节", "肌肉", "肌腱", "上皮", "结缔组织", "胚胎",
        "器官", "神经干", "淋巴管", "血管", "心腔", "脑", "脊髓", "腺体", "黏膜",
        "浆膜", "体腔", "蹄", "角", "被毛",
    ),
    "动物生理学": (
        "生理", "心动周期", "血压", "呼吸", "消化", "吸收", "瘤胃", "排尿", "肾小球",
        "内分泌", "激素", "体温", "反射", "血液", "渗透压", "酸碱", "动作电位",
        "兴奋性", "代谢率", "血流量",
    ),
    "动物生物化学": (
        "生化", "酶", "蛋白质", "氨基酸", "糖代谢", "脂代谢", "脂肪酸", "核酸",
        "DNA", "RNA", "维生素", "三羧酸", "ATP", "尿素", "胆红素", "氧化磷酸化",
        "糖原", "酮体", "辅酶",
    ),
    "动物病理学": (
        "病理", "炎症", "肿瘤", "坏死", "变性", "水肿", "充血", "出血", "血栓",
        "梗死", "休克", "发热", "萎缩", "化生", "肉芽组织", "机化", "钙化",
        "肥大", "增生",
    ),
    "兽医药理学": (
        "药理", "药物", "抗生素", "抗菌药", "麻醉药", "镇静", "镇痛", "解热",
        "剂量", "药代", "药效", "受体", "解毒药", "给药", "半衰期", "首过",
        "拮抗", "磺胺", "青霉素", "驱虫药", "首选药", "处方药", "用药", "注射液",
        "疗程", "口服", "肌注", "静脉注射",
    ),
    "兽医微生物学与免疫学": (
        "微生物", "细菌", "病毒", "真菌", "支原体", "衣原体", "螺旋体", "免疫",
        "抗原", "抗体", "补体", "疫苗", "血清", "凝集", "中和试验", "培养基",
        "生化试验", "革兰", "菌落", "干扰素",
    ),
    "兽医传染病学": (
        "传染病", "感染", "传播", "流行", "猪瘟", "口蹄疫", "狂犬病", "布鲁氏菌",
        "结核", "炭疽", "新城疫", "犬瘟热", "细小病毒", "蓝耳", "伪狂犬",
        "禽流感", "小反刍兽疫", "潜伏期", "发病率", "死亡率", "隔离", "封锁",
    ),
    "兽医寄生虫学": (
        "寄生虫", "蠕虫", "线虫", "绦虫", "吸虫", "原虫", "球虫", "弓形虫",
        "蛔虫", "疥螨", "蜱", "蚤", "中间宿主", "终末宿主", "虫卵", "幼虫",
        "感染性", "驱虫", "螨", "虱", "虫体", "终末", "保虫",
    ),
    "兽医公共卫生学": (
        "公共卫生", "人兽共患", "食品安全", "屠宰", "兽医卫生", "检疫", "残留",
        "消毒", "无害化", "兽药残留", "环境卫生", "生物安全",
    ),
    "兽医临床诊断学": (
        "诊断", "症状", "听诊", "叩诊", "触诊", "视诊", "实验室检验", "影像",
        "X线", "超声", "心电图", "穿刺", "体温曲线", "血常规", "尿常规",
        "脉搏", "呼吸数", "检查方法", "临床检查",
    ),
    "兽医内科学": (
        "内科", "消化系统疾病", "呼吸系统疾病", "心血管", "泌尿系统", "神经系统",
        "代谢病", "酮病", "佝偻病", "腹泻", "黄疸", "贫血", "肾炎", "心力衰竭",
        "中毒病", "胃炎", "肠炎", "支气管炎",
    ),
    "兽医外科与手术学": (
        "外科", "手术", "创伤", "骨折", "脱臼", "疝", "脓肿", "缝合", "去势",
        "截肢", "无菌", "绷带", "引流", "清创", "麻醉", "保定",
    ),
    "兽医产科学": (
        "产科", "妊娠", "分娩", "难产", "助产", "胎衣", "乳房炎", "发情",
        "排卵", "不孕", "流产", "子宫", "卵巢", "精液", "产后", "产道",
    ),
    "中兽医学": (
        "中兽医", "中药", "针灸", "经络", "阴阳", "气血", "脏腑", "证候",
        "辨证", "脉象", "五行", "方剂", "穴位", "草药", "汤剂", "补气",
        "活血", "祛湿",
    ),
}

MODULE_OF = {}
for module, points in {
    "基础科目": (
        "兽医法律法规和职业道德",
        "动物解剖学、组织学与胚胎学",
        "动物生理学",
        "动物生物化学",
        "动物病理学",
        "兽医药理学",
        "基础综合题",
    ),
    "预防科目": (
        "兽医微生物学与免疫学",
        "兽医传染病学",
        "兽医寄生虫学",
        "兽医公共卫生学",
        "预防综合题",
    ),
    "临床科目": (
        "兽医临床诊断学",
        "兽医内科学",
        "兽医外科与手术学",
        "兽医产科学",
        "中兽医学",
        "临床综合题",
    ),
    "综合科目": (
        "猪病",
        "禽病",
        "牛羊病",
        "犬猫病",
        "其他动物病",
        "综合病例题",
    ),
}.items():
    for point in points:
        MODULE_OF[point] = module

FALLBACK = {
    "基础科目": "基础综合题",
    "预防科目": "预防综合题",
    "临床科目": "临床综合题",
    "综合科目": "综合病例题",
}

# ---------------------------------------------------------------- helpers


def norm(text: str) -> str:
    text = re.sub(r"\s+", "", str(text))
    return re.sub(r"[（）()\[\]【】,，。、；;:：\"'?？!！\-—~·]", "", text)


def is_orphan(row: dict) -> bool:
    """Stem refers to a case that is not present in the record itself.

    Rows that belong to a shared case group carry the case in ``sharedStem``,
    so they are answerable even when the stem looks like a bare reference.
    """
    if row.get("sharedGroupId"):
        return False
    match = CASE_REF.search(row["question"])
    return bool(match and match.start() <= 6)


def is_mangled(row: dict) -> bool:
    return bool(MANGLED.search(row["question"]))


def is_malformed(row: dict) -> bool:
    if row.get("type") != "single_choice":
        return True
    if len(row["options"]) < 4:
        return True
    for value in row["options"].values():
        if MERGED_OPTION.search(str(value)):
            return True
    if len(set(row["options"].values())) != len(row["options"]):
        return True
    if not row["answer"] or len(row["answer"]) != 1:
        return True
    return False


def species_point(row: dict) -> str:
    text = row["question"]
    hits = [(name, len(pattern.findall(text))) for name, pattern in SPECIES.items()]
    hits = [item for item in hits if item[1]]
    if not hits:
        return "综合病例题"
    hits.sort(key=lambda item: -item[1])
    return hits[0][0]


def score_point(row: dict, point: str) -> tuple[int, int]:
    """Return (stem hits, weighted score). Analysis text is down-weighted so it
    cannot drag a question into a subject the stem never mentions."""
    keywords = KEYWORDS.get(point)
    if not keywords:
        return 0, 0
    stem = row["question"].lower()
    options = " ".join(str(value) for value in row["options"].values()).lower()
    analysis = str(row.get("analysis") or "").lower()
    stem_hits = 0
    total = 0
    for keyword in keywords:
        key = keyword.lower()
        in_stem = stem.count(key)
        stem_hits += in_stem
        total += in_stem * 5 + options.count(key) * 2 + analysis.count(key)
    return stem_hits, total


def classify(row: dict, module: str) -> str:
    if module == "综合科目":
        return species_point(row)
    best, best_score, best_hits = FALLBACK[module], 0, 0
    for point in KEYWORDS:
        if MODULE_OF[point] != module:
            continue
        hits, score = score_point(row, point)
        if score > best_score:
            best, best_score, best_hits = point, score, hits
    # No keyword in the stem at all: only trust the analysis when the evidence
    # there is strong, otherwise keep the question in the generic bucket rather
    # than inventing a precise (and wrong) knowledge point.
    if best_hits == 0 and best_score < 6:
        return FALLBACK[module]
    return best


def quality(row: dict) -> float:
    """Higher is better; used only when a module exceeds its cap."""
    score = 0.0
    score += min(len(row["question"]), 120) / 20.0
    score += min(len(str(row.get("analysis") or "")), 300) / 60.0
    if len(row["options"]) == 5:
        score += 1.0
    files = " ".join(item.get("file", "") for item in row.get("provenance") or [])
    if "真题" in files:
        score += 3.0
    if "模拟" in files or "点题" in files:
        score += 1.0
    if "章节练习" in files:
        score += 0.5
    if row.get("images"):
        score += 2.0
    return score


def load_banks() -> dict[str, list[dict]]:
    banks = {}
    for path in sorted(QUESTIONS.glob("*/questions.json")):
        banks[path.parent.name] = json.loads(path.read_text(encoding="utf-8"))
    return banks


def reclassify(row: dict) -> None:
    """Recover the true module, then assign the best knowledge point."""
    provenance = row.get("provenance") or [{}]
    file = provenance[0].get("file", "")
    number = provenance[0].get("questionNumber") or 0

    # 2009-2022 compilation is two 200-question papers per year: the morning paper
    # holds 基础(1-100)+预防(101-200), the afternoon paper holds 临床(1-100)+综合(101-200).
    # Everything the importer filed as 临床 with a number above 100 is really 综合应用.
    if file.startswith("1.2009") and row["chapter"] == "临床科目" and number > 100:
        row["chapter"] = "综合科目"

    module = row["chapter"]
    if module not in MODULES:
        module = MODULE_OF.get(row.get("knowledgePoint"), "基础科目")
        row["chapter"] = module
    row["knowledgePoint"] = classify(row, module)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["analyze", "apply"])
    args = parser.parse_args()

    banks = load_banks()
    rows: list[tuple[str, dict]] = []
    for name, items in banks.items():
        for item in items:
            rows.append((name, item))

    # 1. structural reclassification first, so caps apply to the true module
    for _, row in rows:
        reclassify(row)

    removed: list[dict] = []
    kept: list[tuple[str, dict]] = []

    # 2. drop unusable rows
    for name, row in rows:
        reason = None
        if is_mangled(row):
            reason = "组题残留：病例段与题干被拆散"
        elif is_orphan(row):
            reason = "缺病例材料：题干指代该病/该群但无病例"
        elif is_malformed(row):
            reason = "格式损坏：题型或选项异常"
        if reason:
            removed.append({"bank": name, "reason": reason, "question": row})
        else:
            kept.append((name, row))

    # 3. drop duplicates, keep the highest quality copy
    grouped: dict[str, list[tuple[str, dict]]] = defaultdict(list)
    for name, row in kept:
        grouped[norm(row["question"])].append((name, row))
    deduped: list[tuple[str, dict]] = []
    for key, group in grouped.items():
        if len(group) == 1:
            deduped.append(group[0])
            continue
        group.sort(key=lambda item: -quality(item[1]))
        deduped.append(group[0])
        for name, row in group[1:]:
            removed.append(
                {"bank": name, "reason": "重复题：保留信息最完整的一条", "question": row}
            )

    # 4. cap each module, keeping knowledge point coverage
    by_module: dict[str, list[tuple[str, dict]]] = defaultdict(list)
    for name, row in deduped:
        by_module[row["chapter"]].append((name, row))

    final: list[tuple[str, dict]] = []
    for module, items in by_module.items():
        if len(items) <= CAP_PER_MODULE:
            final.extend(items)
            continue
        # Keep every source and every knowledge point in proportion, so the cap
        # thins the pool evenly instead of wiping out a whole bank.
        by_group: dict[tuple[str, str], list[tuple[str, dict]]] = defaultdict(list)
        for name, row in items:
            by_group[(SOURCE_GROUPS.get(name, name), row["knowledgePoint"])].append(
                (name, row)
            )
        for group in by_group.values():
            group.sort(key=lambda item: -quality(item[1]))
        total = len(items)
        picked: list[tuple[str, dict]] = []
        leftovers: list[tuple[str, dict]] = []
        for key, group in by_group.items():
            quota = max(6, round(CAP_PER_MODULE * len(group) / total))
            picked.extend(group[:quota])
            leftovers.extend(group[quota:])
        leftovers.sort(key=lambda item: -quality(item[1]))
        picked.extend(leftovers[: max(0, CAP_PER_MODULE - len(picked))])
        picked = picked[:CAP_PER_MODULE]
        chosen = {id(row) for _, row in picked}
        for name, row in items:
            if id(row) not in chosen:
                removed.append(
                    {
                        "bank": name,
                        "reason": f"冗余：{module}超过 {CAP_PER_MODULE} 题上限",
                        "question": row,
                    }
                )
        final.extend(picked)

    # 5. report
    distribution = Counter(row["chapter"] for _, row in final)
    points = Counter(f"{row['chapter']} / {row['knowledgePoint']}" for _, row in final)
    reasons = Counter(item["reason"] for item in removed)
    print(
        json.dumps(
            {
                "before": len(rows),
                "after": len(final),
                "removed": len(removed),
                "byReason": reasons,
                "byModule": distribution,
                "byPoint": dict(sorted(points.items())),
                "byBank": Counter(name for name, _ in final),
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    if args.mode != "apply":
        return

    # 6. write back, grouping rows by the directory that matches their source
    per_bank: dict[str, list[dict]] = defaultdict(list)
    for name, row in final:
        target = SOURCE_GROUPS.get(name, name)
        per_bank[target].append(row)
    for name in OUTPUT_DIRS:
        rows_out = per_bank.get(name, [])
        if not rows_out:
            continue
        directory = QUESTIONS / name
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "questions.json").write_text(
            json.dumps(rows_out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"{name}: {len(rows_out)}")

    # drop directories that were merged away or emptied
    for name in BANK_DIRS:
        directory = QUESTIONS / name
        if name in OUTPUT_DIRS or not directory.exists():
            continue
        (directory / "questions.json").unlink()
        directory.rmdir()
        print(f"removed dir: {name}")

    ARCHIVE.mkdir(parents=True, exist_ok=True)
    payload = {
        "removedAt": "2026-10-18",
        "reason": "清理不可作答、重复、格式损坏与超出配比上限的题目",
        "count": len(removed),
        "items": removed,
    }
    digest = hashlib.sha256(
        json.dumps(payload, ensure_ascii=False).encode("utf-8")
    ).hexdigest()[:12]
    archive_path = ARCHIVE / f"removed-20261018-{digest}.json"
    archive_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"archive: {archive_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
