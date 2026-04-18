# codex-harnees-kit

Harnees 是一个本地 Codex workflow harness。MVP 使用 TypeScript CLI 编排 Superpowers 生命周期，并按需加载 ECC skills。

## MVP 命令

```bash
npm run dev -- start "登录超时后页面会卡住"
npm run dev -- status <run-id>
npm run dev -- list
npm run dev -- resume <run-id>
npm run dev -- step <run-id> verify
```
