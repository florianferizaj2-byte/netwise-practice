"""Import user-provided veterinary exam PDFs into the veterinary certificate bank.

The importer is deliberately conservative: questions with missing answers,
missing options, missing explanations, duplicate option labels, or image
references are kept in the report but are not published to the deployable bank.
The 2023 scan-only PDF is recorded as skipped because OCR was not requested.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(r"E:\BaiduNetdiskDownload")
DESTINATION = ROOT / "server" / "question-banks" / "veterinary-practitioner"


SOURCES = [
    {
        "file": "2025年执兽考试基础真题及答案.pdf",
        "key": "2025-basic",
        "bank": "basic-subject",
        "chapter": "基础科目",
        "kind": "2025 真题",
    },
    {
        "file": "2025年执兽考试临床真题及答案.pdf",
        "key": "2025-clinical",
        "bank": "clinical-subject",
        "chapter": "临床科目",
        "kind": "2025 真题",
    },
    {
        "file": "2025年执兽考试预防真题及答案.pdf",
        "key": "2025-preventive",
        "bank": "preventive-subject",
        "chapter": "预防科目",
        "kind": "2025 真题",
    },
    {
        "file": "2025年执兽考试综合真题及答案.pdf",
        "key": "2025-comprehensive",
        "bank": "comprehensive-subject",
        "chapter": "综合科目",
        "kind": "2025 真题",
    },
    {
        "file": "2026执兽基础科目回忆版真题.pdf",
        "key": "2026-recall-basic",
        "bank": "basic-subject",
        "chapter": "基础科目",
        "kind": "2026 回忆版真题",
    },
    {
        "file": "2026执兽临床科目回忆版真题.pdf",
        "key": "2026-recall-clinical",
        "bank": "clinical-subject",
        "chapter": "临床科目",
        "kind": "2026 回忆版真题",
    },
    {
        "file": "2026执兽预防科目回忆版真题.pdf",
        "key": "2026-recall-preventive",
        "bank": "preventive-subject",
        "chapter": "预防科目",
        "kind": "2026 回忆版真题",
    },
    {
        "file": "2026执兽综合科目回忆版真题.pdf",
        "key": "2026-recall-comprehensive",
        "bank": "comprehensive-subject",
        "chapter": "综合科目",
        "kind": "2026 回忆版真题",
    },
    {
        "file": "2026年全国执业兽医《兽医全科类（上午卷）》模拟试卷一.pdf",
        "key": "2026-mock-morning",
        "bank": "mock-exams",
        "chapter": "全科上午卷",
        "kind": "2026 模拟试卷",
    },
    {
        "file": "2026年全国执业兽医《兽医全科类（上午卷）》考前点题卷一.pdf",
        "key": "2026-point-morning",
        "bank": "mock-exams",
        "chapter": "全科上午卷",
        "kind": "2026 考前点题卷",
    },
    {
        "file": "2026年全国执业兽医《兽医全科类（下午卷）》模拟试卷一.pdf",
        "key": "2026-mock-afternoon",
        "bank": "mock-exams",
        "chapter": "全科下午卷",
        "kind": "2026 模拟试卷",
    },
    {
        "file": "2026年全国执业兽医《兽医全科类（下午卷）》考前点题卷一.pdf",
        "key": "2026-point-afternoon",
        "bank": "mock-exams",
        "chapter": "全科下午卷",
        "kind": "2026 考前点题卷",
    },
    {
        "file": "3.2024年兽医全科真题级答案解析.pdf",
        "key": "2024-past-exam",
        "bank": "past-exams",
        "chapter": "历年真题",
        "kind": "2024 真题解析",
        "layout": True,
    },
    {
        "file": "1.2009-2022年真题+解析【执业兽医（全科类）】.pdf",
        "key": "2009-2022-past-exams",
        "bank": "past-exams",
        "chapter": "历年真题",
        "kind": "2009-2022 真题解析汇编",
    },
    {
        "file": "章节练习题.pdf",
        "key": "chapter-practice",
        "bank": "chapter-practice",
        "chapter": "章节练习",
        "kind": "章节练习题",
    },
]

SKIPPED_SOURCES = [
    {
        "file": "2.2023年执兽全科真题及答案.pdf",
        "reason": "扫描/图片型 PDF，按用户此前要求暂不进行 OCR",
    }
]


QUESTION_START = re.compile(
    r"^\s*(?:【[^】]+】\s*)?(\d{1,3})(?:\s*[.．、)]|\s+)(.*)$"
)
OPTION_MARK = re.compile(r"(?<![A-Za-z0-9])([A-E])\s*[.．、:：)]\s*")
ANSWER_MARK = re.compile(r"(?:参考答案|答案)\s*(?:】)?\s*[:：;；]?\s*(.*)$")
ANALYSIS_MARK = re.compile(r"(?:【[^】]*解析[^】]*】|答案解析|解析)\s*[:：]?\s*(.*)$")
GROUP_RANGE = re.compile(r"[（(]?\s*(\d{1,3})\s*[-—~～至]\s*(\d{1,3})\s*[）)]?")
SUBJECT_MARKS = (
    ("基础科目", "基础科目"),
    ("临床科目", "临床科目"),
    ("预防科目", "预防科目"),
    ("综合科目", "综合科目"),
)


def normalize_text(value: str, layout: bool = False) -> str:
    value = unicodedata.normalize("NFKC", value)
    value = value.replace("\x08", "").replace("\x00", "").replace("\ufeff", "")
    value = value.replace("\u00a0", " ")
    if layout:
        value = re.sub(r"(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fffA-Za-z0-9])", "", value)
        value = re.sub(r"(?<=[A-Za-z0-9])\s+(?=[A-Za-z0-9])", "", value)
    value = re.sub(r"[ \t]+", " ", value).strip()
    value = re.sub(r"\s*([.．、:：;；])\s*", r"\1", value)
    value = value.replace("答 案", "答案").replace("解 析", "解析")
    return value


def clean_lines(text: str, layout: bool = False) -> list[str]:
    # Some WPS-generated PDFs expose escaped line breaks literally as the two
    # characters "\\n". Turn those back into real line breaks before parsing;
    # otherwise an answer line can swallow the next numbered question.
    text = text.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\r", "\n")
    lines = []
    for raw in text.splitlines():
        line = normalize_text(raw, layout=layout)
        if not line:
            continue
        if any(token in line for token in ("专业网校课程", "羿文教育官网", "版权所有")):
            continue
        if re.fullmatch(r"\d{1,3}", line):
            continue
        lines.append(line)
    return lines


def option_parts(line: str) -> tuple[str, list[tuple[str, str]]]:
    matches = list(OPTION_MARK.finditer(line))
    if not matches:
        return line.strip(), []
    prefix = line[: matches[0].start()].strip()
    parts = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(line)
        value = line[match.end() : end].strip()
        if value:
            parts.append((match.group(1), value))
    return prefix, parts


def answer_letters(line: str) -> list[str]:
    match = ANSWER_MARK.search(line)
    if not match:
        return []
    tail = match.group(1)
    # The answer is normally one to five letters before punctuation or text.
    letters = re.findall(r"(?<![A-Za-z])([A-E])(?![A-Za-z])", tail)
    return list(dict.fromkeys(letter.upper() for letter in letters))[:5]


def section_from_line(line: str, fallback: str) -> str:
    for marker, chapter in SUBJECT_MARKS:
        if marker in line:
            return chapter
    if line.startswith("第") and "篇" in line and len(line) <= 100:
        return f"章节练习：{line[:90]}"
    if "上午卷" in line:
        return "全科上午卷"
    if "下午卷" in line:
        return "全科下午卷"
    return fallback


def looks_like_group_line(line: str) -> bool:
    return "共用选项" in line or bool(
        re.match(r"^\s*[（(]?\s*\d{1,3}\s*[-—~～至]\s*\d{1,3}", line)
    )


def parse_pdf(path: Path, source: dict) -> tuple[list[dict], dict]:
    reader = PdfReader(str(path))
    page_texts = []
    for page in reader.pages:
        if source.get("layout"):
            page_texts.append(page.extract_text(extraction_mode="layout") or "")
        else:
            page_texts.append(page.extract_text() or "")
    text = "\n".join(page_texts)
    lines = clean_lines(text, layout=bool(source.get("layout")))

    parsed = []
    current = None
    state = "question"
    chapter = source["chapter"]
    group_range = None
    group_options: dict[str, str] = {}
    group_context: list[str] = []
    collecting_group = False
    group_has_shared_label = False
    group_unmarked_candidate = None

    def add_option(target: dict, duplicates: list[str], key: str, value: str) -> None:
        if key in target and target[key] != value:
            duplicates.append(key)
            return
        target[key] = value

    def add_line(target: list[str], line: str) -> None:
        if line and (not target or target[-1] != line):
            target.append(line)

    def feed_question_text(target: dict, line: str) -> None:
        prefix, parts = option_parts(line)
        if prefix:
            add_line(target["question_parts"], prefix)
        if parts:
            for key, value in parts:
                add_option(target["options"], target["duplicate_options"], key, value)
            target["state"] = "options"
        elif line:
            add_line(target["question_parts"], line)

    def feed_current(line: str) -> None:
        nonlocal state
        if current is None:
            return
        analysis_match = ANALYSIS_MARK.search(line)
        if analysis_match:
            state = "analysis"
            current["state"] = state
            add_line(current["analysis_parts"], analysis_match.group(1).strip())
            return
        if ANSWER_MARK.search(line):
            current["answer"] = answer_letters(line)
            state = "after_answer"
            current["state"] = state
            return
        prefix, parts = option_parts(line)
        if parts and not prefix:
            for key, value in parts:
                add_option(current["options"], current["duplicate_options"], key, value)
            state = "options"
            current["state"] = state
            return
        if state == "analysis":
            add_line(current["analysis_parts"], line)
        elif state == "after_answer":
            # The 2024 extraction often omits the literal "解析" label.
            add_line(current["analysis_parts"], line)
        elif parts:
            for key, value in parts:
                add_option(current["options"], current["duplicate_options"], key, value)
            state = "options"
            current["state"] = state
        else:
            add_line(current["question_parts"], line)

    def finish_current() -> None:
        nonlocal current
        if current is None:
            return
        question = " ".join(current.pop("question_parts")).strip()
        analysis = " ".join(current.pop("analysis_parts")).strip()
        current.pop("state", None)
        current["question"] = re.sub(r"^【[^】]+】\s*", "", question).strip()
        current["analysis"] = analysis
        current["options"] = {
            key: value.strip()
            for key, value in current["options"].items()
            if value.strip()
        }
        parsed.append(current)
        current = None

    for line in lines:
        next_chapter = section_from_line(line, chapter)
        if next_chapter != chapter and not QUESTION_START.match(line):
            chapter = next_chapter

        group_match = GROUP_RANGE.search(line) if looks_like_group_line(line) else None
        if group_match and not QUESTION_START.match(line):
            group_range = (int(group_match.group(1)), int(group_match.group(2)))
            group_options = {}
            group_context = []
            collecting_group = True
            group_has_shared_label = "共用选项" in line
            group_unmarked_candidate = None
            remainder = line[group_match.end() :].strip()
            remainder = remainder.replace("题共用选项", "").replace("共用选项", "").strip()
            if remainder:
                group_context.append(remainder)
            continue

        question_match = QUESTION_START.match(line)
        # The large 2009-2022 PDF begins with a numeric table of contents
        # such as 1.2.1. Those are not questions; a real question can still
        # begin with a numeric fact such as "23.2 岁".
        if question_match and re.fullmatch(r"\d+(?:\.\d+)+", line):
            question_match = None
        if question_match:
            number = int(question_match.group(1))
            if current is not None:
                finish_current()
            if collecting_group and group_unmarked_candidate:
                group_context.append(group_unmarked_candidate)
                group_unmarked_candidate = None
            if group_range and number > group_range[1]:
                group_range = None
                group_options = {}
                group_context = []
                collecting_group = False
                group_has_shared_label = False
            in_group = bool(group_range and group_range[0] <= number <= group_range[1])
            options = dict(group_options) if in_group else {}
            context = list(group_context) if in_group else []
            current = {
                "number": number,
                "chapter": chapter,
                "question_parts": context,
                "options": options,
                "duplicate_options": [],
                "answer": [],
                "analysis_parts": [],
                "state": "question",
            }
            collecting_group = False
            state = "question"
            rest = question_match.group(2).strip()
            if rest:
                feed_question_text(current, rest)
            continue

        if collecting_group:
            prefix, parts = option_parts(line)
            if parts and not prefix:
                if group_unmarked_candidate and not group_has_shared_label:
                    if current is not None:
                        finish_current()
                    current = {
                        "number": group_range[0],
                        "chapter": chapter,
                        "question_parts": list(group_context),
                        "options": {},
                        "duplicate_options": [],
                        "answer": [],
                        "analysis_parts": [],
                        "state": "question",
                    }
                    feed_question_text(current, group_unmarked_candidate)
                    group_unmarked_candidate = None
                    collecting_group = False
                    state = current["state"]
                    for key, value in parts:
                        add_option(current["options"], current["duplicate_options"], key, value)
                    current["state"] = "options"
                    state = "options"
                else:
                    for key, value in parts:
                        add_option(group_options, [], key, value)
            elif line and not line.startswith("第"):
                if not group_has_shared_label and not group_options and group_unmarked_candidate is None:
                    group_unmarked_candidate = line
                else:
                    group_context.append(line)
            continue

        feed_current(line)

    finish_current()
    return parsed, {
        "pages": len(reader.pages),
        "characters": len(text),
        "emptyPages": sum(1 for page in page_texts if not page.strip()),
    }


def question_fingerprint(question: dict) -> str:
    payload = re.sub(r"[\s，。？?！!、：:]", "", question["question"]).lower()
    payload += json.dumps(question["options"], ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def review_reasons(question: dict) -> list[str]:
    reasons = []
    options = question["options"]
    if len(question["question"]) < 10:
        reasons.append("题干过短或解析顺序异常")
    if not all(key in options for key in ("A", "B", "C", "D")):
        reasons.append("缺少 A-D 标准选项")
    if len(options) > 5:
        reasons.append("选项数量超过五个")
    if question["duplicate_options"]:
        reasons.append("原文存在重复选项标签：" + ",".join(sorted(set(question["duplicate_options"]))))
    if not question["answer"]:
        reasons.append("未识别到答案")
    elif any(key not in options for key in question["answer"]):
        reasons.append("答案字母不在选项中")
    if len(question["analysis"]) < 12:
        reasons.append("缺少可发布的答案解析")
    if re.search(r"(?:图中|如下图|见图|图片题|图示|下图)", question["question"]):
        reasons.append("题目依赖图片，当前题目结构未携带图片")
    if len({value.strip().lower() for value in options.values()}) != len(options):
        reasons.append("存在重复选项内容")
    return list(dict.fromkeys(reasons))


def source_slug(source: dict) -> str:
    return source["key"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", nargs="?", type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args()
    source_root = args.source.resolve()

    by_bank: dict[str, list[dict]] = defaultdict(list)
    review = []
    duplicates = []
    source_reports = []
    seen: dict[str, dict] = {}
    published_sequence = defaultdict(int)

    for source in SOURCES:
        path = source_root / source["file"]
        report = {
            "file": source["file"],
            "kind": source["kind"],
            "bank": source["bank"],
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None,
        }
        if not path.exists():
            report.update({"status": "missing", "parsed": 0, "published": 0, "review": 0})
            source_reports.append(report)
            continue

        parsed, stats = parse_pdf(path, source)
        report.update(stats)
        report["status"] = "read"
        report["parsed"] = len(parsed)
        report["published"] = 0
        report["review"] = 0

        for index, raw in enumerate(parsed, 1):
            raw["provenance"] = [
                {
                    "file": source["file"],
                    "questionNumber": raw["number"],
                    "sourceIndex": index,
                    "sha256": report["sha256"],
                }
            ]
            raw["sourceVerification"] = "用户提供资料，未独立核实年份、出处与答案"
            reasons = review_reasons(raw)
            if reasons:
                report["review"] += 1
                review.append(
                    {
                        "file": source["file"],
                        "bank": source["bank"],
                        "number": raw["number"],
                        "reasons": reasons,
                        "question": raw,
                    }
                )
                continue

            published_sequence[source_slug(source)] += 1
            question = {
                "id": f"vet-{source_slug(source)}-{published_sequence[source_slug(source)]:05d}",
                "type": "multiple_choice" if len(raw["answer"]) > 1 else "single_choice",
                "question": raw["question"],
                "options": raw["options"],
                "answer": raw["answer"],
                "analysis": raw["analysis"],
                "chapter": raw["chapter"][:100],
                "knowledgePoint": f"{raw['chapter']}题目",
                "difficulty": "medium",
                "tags": ["执业兽医", raw["chapter"][:45], source["kind"][:45]],
                "provenance": raw["provenance"],
                "sourceVerification": raw["sourceVerification"],
            }
            fingerprint = question_fingerprint(question)
            prior = seen.get(fingerprint)
            if prior:
                prior["provenance"].extend(question["provenance"])
                duplicates.append(
                    {
                        "retainedId": prior["id"],
                        "duplicateSource": source["file"],
                        "duplicateQuestionNumber": raw["number"],
                        "provenance": question["provenance"],
                    }
                )
                continue
            seen[fingerprint] = question
            by_bank[source["bank"]].append(question)
            report["published"] += 1

        source_reports.append(report)

    for bank in {source["bank"] for source in SOURCES}:
        destination = DESTINATION / "questions" / bank
        destination.mkdir(parents=True, exist_ok=True)
        (destination / "questions.json").write_text(
            json.dumps(by_bank.get(bank, []), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    report = {
        "status": "imported_text_pdfs_ocr_skipped",
        "certificateId": "veterinary-practitioner",
        "sourceRoot": str(source_root),
        "publishedCount": sum(len(items) for items in by_bank.values()),
        "reviewCount": len(review),
        "duplicateCount": len(duplicates),
        "sourceCount": len(SOURCES),
        "documents": source_reports,
        "skipped": SKIPPED_SOURCES,
        "duplicates": duplicates,
        "needsReview": review,
        "reviewPolicy": "缺答案、缺 A-D 选项、缺解析、重复选项标签或依赖图片的题只进入报告，不发布到练习题库。",
    }
    (DESTINATION / "reports" / "import-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(
        json.dumps(
            {
                "publishedCount": report["publishedCount"],
                "reviewCount": report["reviewCount"],
                "duplicateCount": report["duplicateCount"],
                "skipped": len(report["skipped"]),
                "documents": [
                    {
                        "file": row["file"],
                        "parsed": row["parsed"],
                        "published": row["published"],
                        "review": row["review"],
                    }
                    for row in source_reports
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
