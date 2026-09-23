#!/usr/bin/env python3
"""把后台页面里新引入的 t("…") 词条批量合并进 admin-i18n 词典。

背景：i18n 统一迁移中，页面先把硬编码中文替换成 t("中文原文")，
词条由本脚本统一写入词典（key = 中文原文，值只写 zh —— 与词典既有条目同口径，
en 缺省时 translate 回落中文）。这样避免多个迁移者同时写词典造成冲突。

用法：
  python3 scripts/merge-admin-i18n.py --dry-run   # 只看要新增哪些
  python3 scripts/merge-admin-i18n.py             # 实际写入
"""
import io
import re
import sys
import glob

DICT = "src/lib/admin-i18n.ts"
SCAN_GLOBS = [
    "src/app/admin/**/*.tsx",
    "src/components/admin/**/*.tsx",
]


def dict_keys() -> set[str]:
    text = io.open(DICT, encoding="utf-8").read()
    keys = set()
    # 第三分支放宽到非 ASCII：prettier 会把中文 key 去引号（合法标识符）
    for m in re.finditer(r'(?:"([^"]+)":|([^\s"\'{}:,()]+):)\s*\{', text):
        keys.add(m.group(1) or m.group(2))
    return keys


def page_usages() -> dict[str, list[str]]:
    """返回 {中文词条: [出处文件,…]}；只收中文 key（本次统一的新增口径）。"""
    out: dict[str, list[str]] = {}
    for pattern in SCAN_GLOBS:
        for path in glob.glob(pattern, recursive=True):
            src = io.open(path, encoding="utf-8").read()
            # 允许尾随逗号：prettier 会把超长文案折行成 t(\n "…",\n)
            for m in re.finditer(r'\bt\(\s*"((?:[^"\\]|\\.)*)"\s*,?\s*\)', src):
                key = m.group(1)
                if not re.search(r"[\u4e00-\u9fa5]", key):
                    continue  # 只管中文词条；英文 key 属既有词典
                out.setdefault(key, []).append(path)
    return out


def main() -> None:
    dry = "--dry-run" in sys.argv
    known = dict_keys()
    usages = page_usages()
    missing = sorted(k for k in usages if k not in known)

    print(f"词典现有 key：{len(known)}")
    print(f"页面 t() 中文词条：{len(usages)}（已收录 {len(usages) - len(missing)}，待新增 {len(missing)}）")
    if not missing:
        print("无需新增 ✔")
        return
    for k in missing[:15]:
        print(f"  + {k[:52]}  ← {usages[k][0]}")
    if len(missing) > 15:
        print(f"  … 其余 {len(missing) - 15} 条")

    if dry:
        print("\n（--dry-run：未写入）")
        return

    text = io.open(DICT, encoding="utf-8").read()
    anchor = "  /* ── 后台页面文案（key 为中文原文；en 缺省时回落中文，与既有条目同口径）── */"
    if anchor not in text:
        raise SystemExit("找不到插入锚点，请检查词典文件结构")

    lines = ["", "  /* ── i18n 统一迁移新增（2026-09-23，脚本 scripts/merge-admin-i18n.py 生成）── */"]
    for k in missing:
        esc = k.replace("\\", "\\\\").replace('"', '\\"')
        lines.append(f'  "{esc}": {{ zh: "{esc}" }},')
    text = text.replace(anchor, anchor + "\n".join(lines), 1)
    io.open(DICT, "w", encoding="utf-8").write(text)
    print(f"\n已写入 {len(missing)} 条词条到 {DICT}")


if __name__ == "__main__":
    main()
