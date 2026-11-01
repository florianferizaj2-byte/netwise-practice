# -*- coding: utf-8 -*-
"""对旧批次做答案位置打散：保持题目内容与正确选项文本不变，只重排 A/B/C/D。

校验：
1. 每题的选项文本集合前后完全一致；
2. 正确答案对应的文本前后一致；
3. 解析中对选项字母的引用同步重映射（Option/方案/Type 等专有名词不映射）。
"""
import io
import json
import os
import re
import random
import hashlib
import collections

BASE = r"C:/aceexam-v1-release/server/question-banks"
BANKS = ["hcip-datacom-core", "hcip-datacom-advanced"]
NEW = set(["hcip1800-core-%02d.json" % i for i in range(14, 20)]) | set(
    ["hcip1800-adv-%02d.json" % i for i in range(7, 18)]
)
LETTER_REF = re.compile(r"(?<![A-Za-z0-9])([ABCD])(?![A-Za-z0-9])")


def remap(text, mapping):
    def repl(m):
        s = m.start()
        prefix = (text[max(0, s - 8):s]).lower()
        if "option" in prefix or "方案" in prefix or "type" in prefix:
            return m.group(1)
        return mapping.get(m.group(1), m.group(1))

    return LETTER_REF.sub(repl, text or "")


def shuffle(qid, opts, ans):
    items = sorted(opts.items())
    rnd = random.Random(int(hashlib.md5(("old:" + qid).encode("utf-8")).hexdigest()[:8], 16))
    rnd.shuffle(items)
    letters = ["A", "B", "C", "D", "E"]
    mapping, new_opts = {}, {}
    for i, (old, text) in enumerate(items):
        mapping[old] = letters[i]
        new_opts[letters[i]] = text
    return new_opts, sorted(mapping[a] for a in ans), mapping


def main():
    total = changed = 0
    for bank in BANKS:
        d = os.path.join(BASE, bank, "questions", "released-20261020")
        for f in sorted(os.listdir(d)):
            if not f.endswith(".json") or f in NEW:
                continue
            path = os.path.join(d, f)
            rows = json.load(io.open(path, encoding="utf-8"))
            out = []
            for q in rows:
                total += 1
                if q["type"] == "true_false":
                    out.append(q)
                    continue
                before_opts = dict(q["options"])
                before_text = {before_opts[k] for k in q["answer"]}
                new_opts, new_ans, mapping = shuffle(q["id"], before_opts, q["answer"])
                assert set(new_opts.values()) == set(before_opts.values()), q["id"]
                assert {new_opts[k] for k in new_ans} == before_text, q["id"]
                if list(new_opts.items()) != list(before_opts.items()):
                    changed += 1
                q["options"] = new_opts
                q["answer"] = new_ans
                q["analysis"] = remap(q["analysis"], mapping)
                out.append(q)
            io.open(path, "w", encoding="utf-8").write(
                json.dumps(out, ensure_ascii=False, indent=2) + "\n"
            )
    print("处理 %d 题，重排 %d 题，校验通过" % (total, changed))


if __name__ == "__main__":
    main()
