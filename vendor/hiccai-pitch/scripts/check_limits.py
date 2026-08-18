#!/usr/bin/env python3
"""素材文案平台限制自检。

用法：
    python3 scripts/check_limits.py <文案文件>                 # 自动定位文案章节
    python3 scripts/check_limits.py <文案文件> --all           # 把整个文件都当文案
    python3 scripts/check_limits.py <文案文件> -p juliang_feed # 只查一个平台
    python3 scripts/check_limits.py --list                     # 看有哪些平台

吃 skill 产出的 markdown：会自动只取标题含"文案"的章节，不会把诊断正文误当文案。
规格数字全部读 references/platform-specs.json，改那个文件即可，本脚本不用动。
"""
import argparse, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPECS = ROOT / "references" / "platform-specs.json"


def load_specs():
    if not SPECS.exists():
        sys.exit(f"找不到规格文件：{SPECS}")
    try:
        return json.loads(SPECS.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        sys.exit(f"规格文件不是合法 JSON：{e}")


def locate_copy_sections(text):
    """找出标题里含"文案"的章节正文。找不到就返回 None。"""
    lines = text.splitlines()
    heads = [(i, len(m.group(1)), l) for i, l in enumerate(lines)
             if (m := re.match(r"^(#{1,6})\s", l))]
    picked, taken = [], False
    for n, (i, lvl, title) in enumerate(heads):
        if "文案" in title and "拆解" not in title:
            end = len(lines)
            for j, l2, _ in heads[n + 1:]:
                if l2 <= lvl:
                    end = j
                    break
            picked.extend(lines[i + 1:end])
            taken = True
    return picked if taken else None


def extract_copies(lines):
    """优先只取列表项（skill 产出的文案就是列表）。
    一条列表项都没有时，才退回逐行取，避免把章节说明句当成文案。"""
    listed, loose = [], []
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith(("#", ">", "|", "```", "---")):
            continue
        is_item = bool(re.match(r"^\s*(?:\d+[.、)]|[-*+])\s+", line))
        line = re.sub(r"^\s*(?:\d+[.、)]|[-*+])\s*", "", line)
        line = re.sub(r"[*_`]", "", line).strip()
        if len(line) < 4:
            continue
        (listed if is_item else loose).append(line)
    return listed or loose


def main():
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("file", nargs="?")
    ap.add_argument("-p", "--platform")
    ap.add_argument("--all", action="store_true", help="不做章节定位，整个文件都当文案")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("-h", "--help", action="help")
    args = ap.parse_args()

    data = load_specs()
    plats, meta = data["platforms"], data.get("_meta", {})

    if args.list:
        print(f"规格最后核对：{meta.get('last_reviewed','未知')}\n")
        for k, v in plats.items():
            print(f"  {k:<24} 上限 {str(v.get('title_max','—')):>3} 字"
                  f"（{v.get('title_confidence','?')}）  {v['name']}")
        return

    if not args.file:
        sys.exit("请给一个文案文件，或用 --list 查看平台。")
    fp = Path(args.file)
    if not fp.exists():
        sys.exit(f"文件不存在：{fp}")

    text = fp.read_text(encoding="utf-8")
    if args.all:
        lines, scope = text.splitlines(), "整个文件"
    else:
        sec = locate_copy_sections(text)
        if sec is None:
            lines, scope = text.splitlines(), "整个文件（未找到文案章节）"
        else:
            lines, scope = sec, "文案章节"

    copies = extract_copies(lines)
    if not copies:
        sys.exit("没从文件里认出任何文案。试试加 --all。")

    if args.platform and args.platform not in plats:
        sys.exit(f"没有这个平台：{args.platform}（用 --list 看可选项）")
    targets = {args.platform: plats[args.platform]} if args.platform else plats

    print(f"\n文案 {len(copies)} 条（取自{scope}）　｜　规格最后核对 {meta.get('last_reviewed','未知')}")
    print("⚠️  平台字数上限会变，以投放后台实时校验为准。\n")

    # 汇总表：每个平台过了几条
    print("　平台通过情况")
    rows = []
    for key, p in targets.items():
        lim = p.get("title_max")
        if not lim:
            continue
        over = [i for i, c in enumerate(copies) if len(c) > lim]
        rows.append((key, p.get("short", p["name"]), lim, p.get("title_confidence", "?"), over))
    rows.sort(key=lambda r: r[2], reverse=True)
    for key, name, lim, conf, over in rows:
        ok = len(copies) - len(over)
        mark = "✓" if not over else "✗"
        print(f"　{mark} {name:<12} 上限{lim:>3}字（{conf:<6}）　{ok}/{len(copies)} 通过")

    # 超限明细：每条只列一次，标出被哪些平台挡下
    print("\n　超限明细")
    any_over = False
    for i, c in enumerate(copies):
        blocked = [(r[1], r[2]) for r in rows if len(c) > r[2]]
        if blocked:
            any_over = True
            names = "、".join(f"{n}({l})" for n, l in blocked)
            print(f"　第 {i+1:>2} 条 {len(c):>3} 字　挡下：{names}")
            print(f"　　　{c}")
    if not any_over:
        print("　全部通过 ✓")

    loosest = max((r[2] for r in rows), default=0)
    if any_over:
        print(f"\n　注：不必强行改成一稿通投。按 references/platforms.md，"
              f"换平台本来就要换外壳，\n　　　只需保证在你选定的主战场内不超限。")
    print()


if __name__ == "__main__":
    main()
