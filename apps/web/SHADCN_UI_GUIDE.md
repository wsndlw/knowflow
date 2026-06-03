# shadcn/ui 组件基线用法约定

面向 CC-前端 的交接文档。当前基线已在 `apps/web` 接入 shadcn/ui、Radix、Tailwind v4 CSS variables 和 `@/*` 路径别名。

## 可用组件清单

已 add 的 shadcn/ui 组件：

- `button`
- `dialog`
- `alert-dialog`
- `dropdown-menu`
- `context-menu`
- `select`
- `popover`
- `command`
- `checkbox`
- `radio-group`
- `switch`
- `slider`
- `input`
- `textarea`
- `label`
- `badge`
- `card`
- `table`
- `tabs`
- `tooltip`
- `skeleton`
- `scroll-area`
- `separator`
- `sheet`
- `avatar`
- `calendar`
- `collapsible`
- `pagination`

项目特有组件继续保留：

- `feedback`
- `metric-card`
- `citation-popover`

`empty` 组件未安装；继续使用现有 `feedback.tsx` 里的 `EmptyState`。

## Import 路径

新代码统一使用 `@` 别名：

```tsx
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
```

`cn` 只有一份实现：`apps/web/src/lib/cn.ts`。不要再新增 `lib/utils.ts` 或第二套 `cn`。

## Variant 约定

### Button

新代码使用 shadcn 标准 variant：

- `default`
- `secondary`
- `outline`
- `ghost`
- `link`
- `destructive`

删除/危险操作统一用：

```tsx
<Button variant="destructive">删除</Button>
```

兼容别名 `primary`、`danger`、`md` 仅用于旧页面过渡，已标记为 legacy/deprecated 约定；CC-前端 不要在新代码里继续使用。

`loading` 是项目兼容扩展，可继续用于提交按钮：

```tsx
<Button loading={isSaving} disabled={isSaving}>
  保存
</Button>
```

### Badge

shadcn 标准 `variant` 可用；项目旧 `tone` 也保留用于业务状态色：

- `neutral`
- `brand`
- `success`
- `warning`
- `danger`
- `info`

```tsx
<Badge tone="success">已启用</Badge>
```

## Dialog 用法

新代码优先使用标准 shadcn/Radix 组合：

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>编辑标签</DialogTitle>
      <DialogDescription>修改标签名称和颜色。</DialogDescription>
    </DialogHeader>
    ...
    <DialogFooter>
      <Button variant="secondary" onClick={() => setOpen(false)}>
        取消
      </Button>
      <Button>保存</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

旧页面的单组件写法仍兼容，但只作为迁移过渡：

```tsx
<Dialog open={open} onClose={onClose} title="标题" description="说明">
  ...
</Dialog>
```

## Select 用法

新代码优先使用标准 shadcn/Radix 组合：

```tsx
<Select value={value} onValueChange={setValue}>
  <SelectTrigger className="w-48">
    <SelectValue placeholder="请选择" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="public">公开</SelectItem>
    <SelectItem value="department">部门</SelectItem>
  </SelectContent>
</Select>
```

旧 `<option>` 原生写法仍兼容，用于尚未迁移的表单：

```tsx
<Select name="visibility" defaultValue="department">
  <option value="public">公开</option>
  <option value="department">部门</option>
</Select>
```

## 多选下拉

多选下拉不单独新增组件，按组合件实现：`Popover + Command + Checkbox`。

建议结构：

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline">选择标签</Button>
  </PopoverTrigger>
  <PopoverContent className="w-72 p-0">
    <Command>
      <CommandInput placeholder="搜索..." />
      <CommandList>
        <CommandEmpty>无匹配项</CommandEmpty>
        <CommandGroup>
          {items.map((item) => (
            <CommandItem key={item.id} value={item.name} onSelect={() => toggle(item.id)}>
              <Checkbox checked={selectedIds.includes(item.id)} />
              {item.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

## DateRange

DateRange 使用 `Popover + Calendar mode="range"`，不要新造日期范围组件。

```tsx
import type { DateRange } from "react-day-picker";

const [range, setRange] = useState<DateRange | undefined>();

<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline">选择日期范围</Button>
  </PopoverTrigger>
  <PopoverContent align="start" className="w-auto p-0">
    <Calendar mode="range" selected={range} onSelect={setRange} />
  </PopoverContent>
</Popover>;
```

## 暗色策略

当前 knowflow Web 是 light-only 基线：

- `globals.css` 已加入 `@custom-variant dark`，用于兼容 shadcn 默认模板。
- 当前没有启用 `.dark` 根类，也没有 `.dark` token 覆盖。
- 组件里的 `dark:` class 是 shadcn 默认保留，不代表产品已支持暗色主题。

如果后续要启用暗色，必须补充 `.dark` 下的 OKLCH token 覆盖，并做浏览器截图/交互验收。

## 验证记录

本基线已通过：

- `pnpm --filter @knowflow/web typecheck`
- `pnpm --filter @knowflow/web lint`
- `pnpm --filter @knowflow/web build`

渲染冒烟：

- `pnpm --dir apps/web exec next dev --port 3100`
- `GET /` 返回 200
- `GET /knowledge-bases` 返回 200
- `GET /models` 返回 200
- `GET /login` 返回 200
- `GET /agents` 返回 200

浏览器交互冒烟：

- `pnpm dlx --package @playwright/test playwright test shadcn-smoke.spec.ts --reporter=line`
- 真实 `/knowledge-bases` 页面：route mock API 后，点击 Button 打开 Dialog，操作旧 `<option>` Select，关闭 Dialog，无 console/page error。
- 临时本地 smoke 页面：点击 Button 打开标准 Dialog，操作标准 Radix Select，打开 Popover，无 console/page error。

临时 smoke spec 和临时页面只用于本地验证，未纳入代码提交。CC-前端/CC-主控 后续仍建议在真实业务页面补 Calendar range 的浏览器验收。
