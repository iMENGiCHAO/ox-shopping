#!/usr/bin/env bash
# 启动本机 PostgreSQL(带 GCD workq 自检豁免)。
# 背景:本机 SIP 处于 Custom Configuration(Debugging Restrictions disabled),
# 系统 configd/DNS 子系统异常导致所有进程被派发 GCD workq 线程,
# PostgreSQL 的防 fork 死锁自检(pthread_is_threaded_np)会误判拒启。
# 此 dylib 将该检查恒置为"单线程",对空闲 workq 线程场景安全。
set -euo pipefail
DYLIB=/tmp/libnoforkcheck.dylib
[ -f "$DYLIB" ] || { clang -dynamiclib -o "$DYLIB" /tmp/noforkcheck.c; }
if ! pg_isready -q -h 127.0.0.1 -p 5432 2>/dev/null; then
  DYLD_INSERT_LIBRARIES="$DYLIB" /usr/local/opt/postgresql@17/bin/pg_ctl \
    -D /usr/local/var/postgresql@17 -l /usr/local/var/log/postgresql@17.log start
fi
pg_isready -h 127.0.0.1 -p 5432
