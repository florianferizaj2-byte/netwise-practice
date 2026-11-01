"""Trendy 竖屏版旁白：Edge 神经语音逐句合成，输出 wav + 时间轴 JSON。

用法（在 promo-video/ 下）：python scripts/voiceover.py
产物：public/vo/trendy-XX.wav、src/trendy-v/vo.json（每句文本、起点帧、时长帧）
"""
import asyncio
import json
import shutil
import subprocess
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "vo"
JSON_OUT = ROOT / "src" / "trendy-v" / "vo.json"
# Remotion 自带的 ffmpeg 裁剪了滤镜，这里用系统安装的完整版
FFMPEG = Path(shutil.which("ffmpeg") or "ffmpeg")
FFPROBE = Path(shutil.which("ffprobe") or "ffprobe")
FPS = 30

VOICE = "zh-CN-YunxiNeural"  # Bright, Animated, Cheerful
RATE = "+25%"
PITCH = "+6Hz"

# (起点帧, 文本[, 语速])。起点对齐 120 BPM 拍点（1 拍 = 15 帧），只用页面上真实存在的功能与文案。
LINES = [
    (0, "刷题刷到怀疑人生？", "+45%"),
    (42, "考匠来了！"),
    (62, "同一题错三遍，"),
    (92, "答案看不懂，"),
    (122, "到底错在哪？"),
    (182, "答错了别慌，"),
    (228, "点一下 AI 分析错题，"),
    (302, "错因一针见血，"),
    (345, "原来是把网络层和传输层搞混了！"),
    (422, "练、错、考、看进度，"),
    (488, "一站全搞定！"),
    (542, "五大证书题库，"),
    (590, "电脑手机都能刷！"),
    (662, "考匠 AceExam，"),
    (700, "免费试做五道题！"),
]


def probe_seconds(path: Path) -> float:
    out = subprocess.check_output(
        [str(FFPROBE), "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        text=True,
    )
    return float(out.strip())


async def synth(i: int, text: str, rate: str) -> Path:
    mp3 = OUT / f"trendy-{i:02d}.mp3"
    wav = OUT / f"trendy-{i:02d}.wav"
    await edge_tts.Communicate(text, VOICE, rate=rate, pitch=PITCH).save(str(mp3))
    # 去掉首尾静音，转 48k 立体声 wav；轻微压缩让人声更靠前
    subprocess.run(
        [
            str(FFMPEG), "-hide_banner", "-loglevel", "error", "-y", "-i", str(mp3),
            "-af",
            "silenceremove=start_periods=1:start_threshold=-45dB,"
            "areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
            "highpass=f=90,acompressor=threshold=-18dB:ratio=3:attack=5:release=80,volume=2dB",
            "-ar", "48000", "-ac", "2", str(wav),
        ],
        check=True,
    )
    mp3.unlink()
    return wav


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    JSON_OUT.parent.mkdir(parents=True, exist_ok=True)
    items = []
    for i, (start, text, *opt) in enumerate(LINES):
        wav = await synth(i, text, opt[0] if opt else RATE)
        dur = round(probe_seconds(wav) * FPS)
        items.append({"i": i, "start": start, "dur": dur, "text": text, "file": f"vo/{wav.name}"})
        print(f"{i:02d} start={start:4d} dur={dur:3d}f end={start + dur:4d}  {text}")
    # 检查相邻句是否重叠
    for a, b in zip(items, items[1:]):
        if a["start"] + a["dur"] > b["start"]:
            print(f"OVERLAP: line {a['i']} ends {a['start'] + a['dur']} > line {b['i']} starts {b['start']}", file=sys.stderr)
    JSON_OUT.write_text(json.dumps({"voice": VOICE, "rate": RATE, "pitch": PITCH, "lines": items}, ensure_ascii=False, indent=2), encoding="utf-8")


asyncio.run(main())
