# OpenClaw 控制台 (V0 技术栈)

网关控制台前端，采用 **V0.app 技术栈**：

- **Next.js 15** (App Router, static export)
- **React 19**
- **Tailwind CSS**
- **shadcn/ui** 风格组件 (Radix 原语 + CVA + Tailwind)

## 开发

```bash
# 在仓库根目录
pnpm ui:dev
# 或
pnpm --filter openclaw-control-ui-next dev
```

默认地址: http://localhost:3000

## 构建

```bash
pnpm ui:build
# 或
pnpm control-ui:build
```

产物输出到仓库根目录 `dist/control-ui`，由网关静态托管。

## 旧版 Lit 控制台

Legacy 控制台 (Lit + Vite) 位于 `ui-legacy/`。开发时使用：

```bash
pnpm ui:dev:legacy
```

默认构建与 `pnpm ui:dev` 已指向本应用 (V0 栈)。
