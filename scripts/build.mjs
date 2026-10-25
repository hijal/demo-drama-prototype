#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  NODE_OPTIONS:
    `${process.env.NODE_OPTIONS || ''} --max-old-space-size=${Number(process.env.NEXT_BUILD_HEAP_MB) || 8192}`.trim(),
}
for (const args of [
  ['--workspace', 'web', 'run', 'build'],
  ['exec', '--', 'next', 'build', '--webpack'],
]) {
  const result = spawnSync('npm', args, {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}
