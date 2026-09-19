#!/usr/bin/env bash
# 修复 macOS 15.7+（Sequoia）上 Homebrew PostgreSQL 无法启动的问题。
#
# 现象：任何数据目录、任何版本（14/16/17）的 postmaster 启动即 FATAL:
#   "postmaster became multithreaded during startup"
#   HINT: Set the LC_ALL environment variable to a valid locale.
#
# 根因：Homebrew icu4c 78 的 libicuuc 在 dylib 加载时（比 main() 还早）启动了
# 后台线程，导致 postmaster 的 fork 安全检查（pthread_is_threaded_np() != 0）
# 必然触发。设置任何 LC_ALL 都无效，DYLD_INSERT_LIBRARIES 也无法覆盖
# libSystem 共享缓存中的符号。
#
# 修复：把 postgres 二进制中对 _pthread_is_threaded_np 的 call 指令
# （5 字节 E8 rel32）替换为 `xor eax,eax; nop×3`（31 C0 90 90 90），
# 使检查恒为「单线程」。fork 安全性不受影响——只是禁用了这个在本机
# 必然误报的检查。脚本幂等：已打补丁的位置不再是 E8 开头，自动跳过。
#
# 用法：brew 升级/重装 postgresql 后重跑本脚本即可：
#   bash scripts/fix-postgres-multithreaded.sh
#
# 注意：脚本会备份原二进制到 /tmp/ 并重新做 ad-hoc 签名
# （macOS 要求修改后重签，否则 dyld 会拒绝加载）。

set -euo pipefail

TARGETS=(
  "/usr/local/opt/postgresql@16/bin/postgres"
  "/usr/local/opt/postgresql@14/bin/postgres"
)

for BIN in "${TARGETS[@]}"; do
  if [ ! -f "$BIN" ]; then
    echo "跳过（不存在）: $BIN"
    continue
  fi
  echo "== 处理 $BIN"
  cp "$BIN" "/tmp/$(echo "$BIN" | sed 's#/usr/local/opt/##; s#/bin/postgres##; s#/#-#g').orig.bin"
  chmod u+w "$BIN"

  # 找出所有 callq _pthread_is_threaded_np 的虚拟地址，换算文件偏移并打补丁
  # （已打补丁的二进制里这些指令已变成 xor/nop，grep 无匹配返回 1——必须 || true）
  VAS=$(otool -tvV "$BIN" | grep "callq.*pthread_is_threaded_np" | awk '{print $1}' || true)
  [ -z "$VAS" ] && { echo "  （无待补丁调用点：已全部打过补丁）"; codesign --force --sign - "$BIN" >/dev/null 2>&1 || true; continue; }
  for VA in $VAS; do
    python3 - "$BIN" "$VA" <<'PY'
import sys
path, va = sys.argv[1], sys.argv[2]
off = int(va, 16) - 0x100000000  # __TEXT 段: vmaddr 0x100000000, fileoff 0
with open(path, "r+b") as f:
    f.seek(off)
    orig = f.read(5)
    if orig[0] != 0xE8:
        print(f"  跳过 {hex(off)}（已是 {orig.hex()}，之前已打补丁）")
        raise SystemExit(0)
    f.seek(off)
    f.write(bytes([0x31, 0xC0, 0x90, 0x90, 0x90]))
    print(f"  ✅ {hex(off)}: {orig.hex()} → 31c0909090")
PY
  done

  codesign --force --sign - "$BIN" >/dev/null 2>&1
  echo "  已重新签名（ad-hoc）"
done

echo "完成。启动 postmaster："
echo "  /usr/local/opt/postgresql@16/bin/pg_ctl -D /usr/local/var/postgresql@16 start"
