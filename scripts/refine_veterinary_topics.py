"""Reclassify the existing veterinary bank without adding or removing questions.

The importer already extracted the question records. This pass only normalizes
their four top-level subjects and assigns a usable knowledge point so the UI can
open subject -> knowledge point -> questions.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BANK = ROOT / "server" / "question-banks" / "veterinary-practitioner" / "questions"

SUBJECTS = ("基础科目", "预防科目", "临床科目", "综合科目")

POINTS = {
    "基础科目": {
        "兽医法律法规和职业道德": (
            "法律",
            "法规",
            "职业道德",
            "动物防疫法",
            "执业兽医",
            "兽药管理",
            "处方",
            "备案",
            "行政处罚",
            "动物检疫",
        ),
        "动物解剖学、组织学与胚胎学": (
            "解剖",
            "组织学",
            "胚胎",
            "上皮",
            "骨骼",
            "肌肉",
            "关节",
            "神经",
            "血管",
            "淋巴",
        ),
        "动物生理学": (
            "生理",
            "心动周期",
            "血压",
            "呼吸",
            "消化",
            "吸收",
            "瘤胃",
            "排尿",
            "肾小球",
            "内分泌",
            "激素",
            "体温",
            "反射",
            "血液",
        ),
        "动物生物化学": (
            "生化",
            "酶",
            "蛋白质",
            "氨基酸",
            "糖代谢",
            "脂代谢",
            "脂肪酸",
            "核酸",
            "DNA",
            "RNA",
            "维生素",
            "三羧酸",
            "ATP",
            "尿素循环",
            "胆红素",
        ),
        "动物病理学": (
            "病理",
            "炎症",
            "肿瘤",
            "坏死",
            "变性",
            "水肿",
            "充血",
            "出血",
            "血栓",
            "梗死",
            "休克",
            "发热",
            "微循环",
        ),
        "兽医药理学": (
            "药理",
            "药物",
            "抗生素",
            "抗菌",
            "麻醉",
            "镇静",
            "镇痛",
            "解热",
            "毒性",
            "剂量",
            "药代",
            "药效",
            "受体",
            "中毒",
        ),
        "基础综合题": (),
    },
    "预防科目": {
        "兽医微生物学与免疫学": (
            "微生物",
            "细菌",
            "病毒",
            "真菌",
            "支原体",
            "衣原体",
            "免疫",
            "抗原",
            "抗体",
            "补体",
            "疫苗",
            "血清",
            "凝集",
            "中和",
        ),
        "兽医传染病学": (
            "传染病",
            "感染",
            "流行病学",
            "传播",
            "猪瘟",
            "口蹄疫",
            "狂犬病",
            "布鲁氏",
            "结核",
            "炭疽",
            "新城疫",
            "犬瘟热",
            "细小病毒",
            "蓝耳",
            "伪狂犬",
        ),
        "兽医寄生虫学": (
            "寄生虫",
            "寄生",
            "蠕虫",
            "线虫",
            "绦虫",
            "吸虫",
            "原虫",
            "球虫",
            "弓形虫",
            "蛔虫",
            "钩虫",
            "疥螨",
            "蜱",
            "蚤",
        ),
        "兽医公共卫生学": (
            "公共卫生",
            "人兽共患",
            "食品安全",
            "屠宰",
            "兽医卫生",
            "检疫",
            "残留",
            "消毒",
            "无害化",
        ),
        "预防综合题": (),
    },
    "临床科目": {
        "兽医临床诊断学": (
            "临床诊断",
            "鉴别诊断",
            "实验室",
            "影像",
            "X线",
            "超声",
            "心电",
            "听诊",
            "叩诊",
            "触诊",
            "诊断",
            "症状",
        ),
        "兽医内科学": (
            "内科",
            "呼吸系统",
            "消化系统",
            "心血管",
            "泌尿",
            "神经系统",
            "代谢病",
            "营养代谢",
            "中毒病",
            "酮病",
            "佝偻病",
            "腹泻",
            "黄疸",
            "贫血",
        ),
        "兽医外科与手术学": (
            "外科",
            "手术",
            "创伤",
            "骨折",
            "脱臼",
            "疝",
            "脓肿",
            "缝合",
            "外伤",
            "剖腹",
            "去势",
            "截肢",
        ),
        "兽医产科学": (
            "产科",
            "妊娠",
            "分娩",
            "难产",
            "助产",
            "胎衣",
            "乳房炎",
            "繁殖",
            "发情",
            "排卵",
            "不孕",
            "流产",
        ),
        "中兽医学": (
            "中兽医",
            "中药",
            "针灸",
            "经络",
            "阴阳",
            "气血",
            "脏腑",
            "证候",
            "辨证",
            "脉象",
            "五行",
        ),
        "临床综合题": (),
    },
    "综合科目": {
        "猪病": ("猪病", "猪瘟", "蓝耳", "伪狂犬", "圆环", "母猪", "仔猪", "生猪"),
        "禽病": ("禽病", "禽", "鸡", "鸭", "鹅", "家禽", "产蛋"),
        "牛羊病": ("牛病", "羊病", "牛", "羊", "奶牛", "肉牛", "羔羊", "反刍"),
        "犬猫病": ("犬病", "猫病", "犬", "猫", "宠物", "犬瘟", "猫瘟", "猫传腹"),
        "其他动物病": ("兔", "马", "骆驼", "鹿", "狐", "貂", "实验动物", "水生", "鱼"),
        "综合病例题": (),
    },
}

CHAPTER_MAP = {
    "第一篇": ("基础科目", "动物解剖学、组织学与胚胎学"),
    "第二篇": ("基础科目", "动物生理学"),
    "第三篇": ("基础科目", "动物生物化学"),
    "第四篇": ("基础科目", "动物病理学"),
    "第五篇": ("基础科目", "兽医药理学"),
    "第六篇": ("预防科目", "兽医微生物学与免疫学"),
    "第七篇": ("预防科目", "兽医传染病学"),
    "第八篇": ("预防科目", "兽医寄生虫学"),
    "第九篇": ("预防科目", "兽医公共卫生学"),
    "第十篇": ("临床科目", "兽医临床诊断学"),
    "第十一篇": ("临床科目", "兽医内科学"),
    "第十二篇": ("临床科目", "兽医外科与手术学"),
    "第十三篇": ("临床科目", "兽医产科学"),
    "第十四篇": ("临床科目", "中兽医学"),
    "第十五篇": ("基础科目", "兽医法律法规和职业道德"),
}


def text_of(question: dict) -> str:
    values = [question.get("question", ""), question.get("analysis", "")]
    values.extend((question.get("options") or {}).values())
    values.extend(question.get("tags") or [])
    return " ".join(str(value) for value in values).lower()


def raw_section(question: dict) -> str:
    tags = question.get("tags") or []
    return tags[1] if len(tags) > 1 else question.get("chapter", "")


def classify(question: dict) -> tuple[str, str]:
    section = raw_section(question)
    if section.startswith("章节练习："):
        for marker, result in CHAPTER_MAP.items():
            if marker in section:
                return result

    current = question.get("chapter", "")
    if current in SUBJECTS:
        candidates = [current]
    elif "上午卷" in section or "上午卷" in current:
        candidates = ["基础科目", "预防科目"]
    elif "下午卷" in section or "下午卷" in current:
        candidates = ["临床科目", "综合科目"]
    else:
        candidates = [subject for subject in SUBJECTS if subject in section]
        if not candidates:
            candidates = list(SUBJECTS)

    text = text_of(question)
    best_subject = candidates[0]
    best_point = next(iter(POINTS[best_subject]))
    best_score = -1
    for subject in candidates:
        for point, keywords in POINTS[subject].items():
            score = sum(text.count(keyword.lower()) for keyword in keywords)
            if score > best_score:
                best_subject, best_point, best_score = subject, point, score
    if best_score <= 0:
        fallback = {
            "基础科目": "基础综合题",
            "预防科目": "预防综合题",
            "临床科目": "临床综合题",
            "综合科目": "综合病例题",
        }
        return best_subject, fallback[best_subject]
    return best_subject, best_point


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("bank", nargs="?", type=Path, default=DEFAULT_BANK)
    args = parser.parse_args()
    counts = Counter()
    changed = 0
    total = 0
    for path in sorted(args.bank.rglob("*.json")):
        questions = json.loads(path.read_text(encoding="utf-8"))
        for question in questions:
            total += 1
            subject, point = classify(question)
            if question.get("chapter") != subject or question.get("knowledgePoint") != point:
                changed += 1
            question["chapter"] = subject
            question["knowledgePoint"] = point
            counts[f"{subject} / {point}"] += 1
        path.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"total": total, "changed": changed, "distribution": counts}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
