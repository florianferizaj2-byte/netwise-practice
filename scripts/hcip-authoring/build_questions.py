# -*- coding: utf-8 -*-
"""HCIP 补题流水线：把紧凑格式的命题稿展开成题库 JSON。

命题稿格式（每行一题，| 分隔）：
  kpcode | type | difficulty | 题干 | A | B | C | D | 答案 | 解析 | 标签

  type: s=单选  m=多选  t=判断（判断题的 A/B 列留空，自动填“正确/错误”）
  答案: 单选 "A"；多选 "ACD"；判断 "A"=正确 "B"=错误
  标签: 用 ; 分隔

用法：
  python build_questions.py core-14.txt [core-15.txt ...]
"""
import io
import json
import os
import re
import sys
import hashlib
import collections

ROOT = r"C:/aceexam-v1-release/server/question-banks"
OUT_DIR = "released-20261020"

TYPE_MAP = {"s": "single_choice", "m": "multiple_choice", "t": "true_false"}


def load_manifest(bank):
    return json.load(io.open(os.path.join(ROOT, bank, "manifest.json"), encoding="utf-8"))


def build_index(manifest):
    idx = {}
    for m in manifest["taxonomy"]["modules"]:
        for s in m["sections"]:
            for kp in s["knowledgePoints"]:
                idx[kp["code"]] = (m["name"], s["name"], kp["name"], kp["scope"])
    return idx


def existing_ids(bank):
    ids = set()
    base = os.path.join(ROOT, bank, "questions")
    for sub in os.listdir(base):
        p = os.path.join(base, sub)
        if not os.path.isdir(p):
            continue
        for f in os.listdir(p):
            if not f.endswith(".json"):
                continue
            for q in json.load(io.open(os.path.join(p, f), encoding="utf-8")):
                ids.add(q["id"])
    return ids


def digest(payload):
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def parse(path):
    rows = []
    errors = []
    for lineno, line in enumerate(io.open(path, encoding="utf-8"), 1):
        line = line.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) != 11:
            errors.append("%s:%d 字段数 %d（应为 11）" % (path, lineno, len(parts)))
            continue
        code, typ, diff, stem, a, b, c, d, ans, ana, tags = parts
        rows.append(
            dict(
                code=code, type=typ, difficulty=diff, stem=stem,
                opts={"A": a, "B": b, "C": c, "D": d},
                answer=ans, analysis=ana, tags=tags,
                src="%s:%d" % (os.path.basename(path), lineno),
            )
        )
    return rows, errors


def validate(row, index):
    e = []
    code = row["code"]
    if code not in index:
        return ["%s 知识点编码不存在：%s" % (row["src"], code)]
    if row["type"] not in TYPE_MAP:
        e.append("%s 题型非法：%s" % (row["src"], row["type"]))
    if row["difficulty"] not in ("easy", "medium", "hard"):
        e.append("%s 难度非法：%s" % (row["src"], row["difficulty"]))
    if len(row["stem"]) < 10:
        e.append("%s 题干过短：%s" % (row["src"], row["stem"][:20]))
    if len(row["analysis"]) < 30:
        e.append("%s 解析过短（%d 字）" % (row["src"], len(row["analysis"])))
    ans = [ch for ch in row["answer"].upper() if ch.strip()]
    if row["type"] == "t":
        if ans not in (["A"], ["B"]):
            e.append("%s 判断题答案只能是 A 或 B" % row["src"])
    elif row["type"] == "s":
        if len(ans) != 1:
            e.append("%s 单选题答案必须 1 个" % row["src"])
    else:
        if len(ans) < 2:
            e.append("%s 多选题答案至少 2 个" % row["src"])
    if len(set(ans)) != len(ans):
        e.append("%s 答案重复" % row["src"])
    if any(x not in "ABCD" for x in ans):
        e.append("%s 答案含非法字母：%s" % (row["src"], row["answer"]))
    if row["type"] == "t":
        opts = {"A": "正确", "B": "错误"}
    else:
        opts = {k: v for k, v in row["opts"].items() if v}
        if len(opts) != 4:
            e.append("%s 选项必须 4 个" % row["src"])
        if len(set(v.strip().lower() for v in opts.values())) != len(opts):
            e.append("%s 存在重复选项" % row["src"])
        for k, v in opts.items():
            if len(v) < 1:
                e.append("%s 选项 %s 为空" % (row["src"], k))
            if len(v) > 60:
                e.append("%s 选项 %s 过长（%d 字）" % (row["src"], k, len(v)))
        # 长度均衡：四项最长/最短比值上限，避免“选最长”线索（纯数值选项不适用）
        lens = [len(v) for v in opts.values()]
        if max(lens) >= 16 and min(lens) >= 4 and max(lens) / min(lens) > 2.6:
            row["_imbalance"] = True
        # 正确项是否唯一最长：作为统计告警，不阻断（整批控制比例）
        if ans and ans[0] in opts:
            al = len(opts[ans[0]])
            if al == max(lens) and lens.count(al) == 1:
                row["_longest"] = True
    if any(x not in opts for x in ans):
        e.append("%s 答案不在选项中" % row["src"])
    return e



LETTER_REF = re.compile(r"(?<![A-Za-z0-9])([ABCD])(?![A-Za-z0-9])")


def remap_letters(text, mapping):
    """把解析中对选项字母的引用同步改成打散后的字母。

    “Option A / 方案 A / Type A”属于专有名词，不做重映射。
    """
    def repl(m):
        start = m.start()
        prefix = (text[max(0, start - 8):start]).lower()
        if "option" in prefix or "方案" in prefix or "type" in prefix:
            return m.group(1)
        return mapping.get(m.group(1), m.group(1))

    return LETTER_REF.sub(repl, text or "")


def shuffled_options(qid, opts, ans):
    """按题目 ID 做确定性打散，消除“答案总在 A”的位置偏置。"""
    import random
    keys = sorted(opts)
    items = [(k, opts[k]) for k in keys]
    rnd = random.Random(int(hashlib.md5(qid.encode("utf-8")).hexdigest()[:8], 16))
    rnd.shuffle(items)
    letters = ["A", "B", "C", "D", "E"]
    mapping = {}
    new_opts = {}
    for i, (old, text) in enumerate(items):
        mapping[old] = letters[i]
        new_opts[letters[i]] = text
    new_ans = sorted(mapping[a] for a in ans)
    return new_opts, new_ans, mapping


    """按题目 ID 做确定性打散，消除“答案总在 A”的位置偏置。"""
    import random
    keys = sorted(opts)
    items = [(k, opts[k]) for k in keys]
    rnd = random.Random(int(hashlib.md5(qid.encode("utf-8")).hexdigest()[:8], 16))
    rnd.shuffle(items)
    letters = ["A", "B", "C", "D", "E"]
    mapping = {}
    new_opts = {}
    for i, (old, text) in enumerate(items):
        mapping[old] = letters[i]
        new_opts[letters[i]] = text
    new_ans = sorted(mapping[a] for a in ans)
    return new_opts, new_ans

def emit(rows, bank, index, used_ids, out_name):
    out = []
    seqs = collections.Counter()
    for r in rows:
        chapter, section, kp, _scope = index[r["code"]]
        # 计算该知识点已用最大序号
        base = r["code"]
        seqs[base] = max(seqs[base], 0)
        n = seqs[base] + 1
        qid = "%s-%03d" % (base, n)
        while qid in used_ids:
            n += 1
            qid = "%s-%03d" % (base, n)
        seqs[base] = n
        used_ids.add(qid)
        typ = TYPE_MAP[r["type"]]
        opts = {"A": "正确", "B": "错误"} if r["type"] == "t" else {k: v for k, v in r["opts"].items() if v}
        ans = [ch for ch in r["answer"].upper() if ch.strip()]
        ana = r["analysis"]
        if typ != "true_false":
            opts, ans, mapping = shuffled_options(qid, opts, ans)
            ana = remap_letters(ana, mapping)
        payload = dict(
            type=typ, question=r["stem"], options=opts, answer=ans,
            analysis=ana, chapter=chapter, knowledgeSection=section,
            knowledgePoint=kp, difficulty=r["difficulty"],
            tags=[t for t in r["tags"].split(";") if t.strip()],
        )
        item = dict(id=qid, **payload)
        item["provenance"] = {
            "questionId": qid,
            "sourceIds": ["huawei-h12-%s-outline" % ("821" if "821" in bank else "831")],
            "locator": "自编题；范围依据官方大纲「%s / %s / %s」。知识点编码 %s。" % (chapter, section, kp, r["code"]),
            "category": "syllabus_practice",
            "reuse": "original",
            "reuseBasis": "依据公开考纲与公开协议规范独立设计题干、选项与解析，未复制第三方题目正文。",
            "reviewDigest": digest(payload),
        }
        item["sourceVerification"] = "syllabus_practice；结构自检通过，待专家复核。"
        out.append(item)
    path = os.path.join(ROOT, bank, "questions", OUT_DIR, out_name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    io.open(path, "w", encoding="utf-8").write(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n"
    )
    return path, len(out)


def main():
    args = sys.argv[1:]
    if not args:
        print("用法: python build_questions.py <命题稿.txt> [...]")
        return 1
    for path in args:
        bank = "hcip-datacom-advanced" if "adv" in os.path.basename(path) else "hcip-datacom-core"
        manifest = load_manifest(bank)
        index = build_index(manifest)
        rows, errors = parse(path)
        for r in rows:
            errors += validate(r, index)
        if errors:
            print("✗ %s 校验失败 %d 处" % (path, len(errors)))
            for e in errors[:30]:
                print("   ", e)
            return 2
        used = existing_ids(bank)
        out_name = os.path.basename(path).replace(".txt", ".json")
        target, n = emit(rows, bank, index, used, out_name)
        kp = collections.Counter(r["code"] for r in rows)
        ty = collections.Counter(r["type"] for r in rows)
        longest = sum(1 for r in rows if r.get("_longest"))
        imb = sum(1 for r in rows if r.get("_imbalance"))
        print("✓ %s → %s  %d 题  %s  知识点 %d 个  正确项唯一最长 %d (%.0f%%)  长度失衡 %d"
              % (os.path.basename(path), os.path.basename(target), n,
                 dict(ty), len(kp), longest, longest * 100.0 / max(1, n), imb))
    return 0


if __name__ == "__main__":
    sys.exit(main())
