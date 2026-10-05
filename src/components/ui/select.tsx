"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Select 下拉选择组件族(基于 @radix-ui/react-select)
 * 含 popper 定位、滚动按钮与 fade/zoom/slide 动画
 */
const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

/** 触发器：点击展开下拉，右侧带 ChevronDown 图标 */
const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
  /* 指针类型：触屏打开下拉依赖 Radix onClick 里的 handleOpen（pointerType !== mouse），
     鼠标打开依赖 onPointerDown —— 两者必须区别对待，见下方 onClick 的 preventDefault。 */
  const pointerTypeRef = React.useRef<string>("mouse");
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
        className,
      )}
      // 防抖修复（大爷 2026-10-04/05 反馈：点规格下拉，页面/大图抖一下）：
      // Radix 在 Trigger 的 onClick 里**裸调 focus()**（radix react-select
      // index.js:273，无 preventScroll）。在 PDP 的 sticky 双栏布局下，浏览器为让
      // trigger「完全可见」会把页面滚动 17~21px（实测 ox-reflective-tee 462→483），
      // sticky 面板内容与大图随之位移 —— 原站（button + 自绘面板）无此副作用。
      //
      // 上一版「先 preventScroll 聚焦、让 Radix 的 focus() 变成对已聚焦元素的
      // no-op」在部分商品上仍会滚（Chrome 对已聚焦元素的 focus() 依然执行
      // scroll-into-view），故升级为**阻止 Radix 内部处理器执行**：
      // Radix 用 composeEventHandlers(triggerProps.onClick, theirs) 且默认检查
      // defaultPrevented —— 我们 preventDefault 后其裸 focus() 被跳过。
      //   · 鼠标：打开由 onPointerDown 完成，preventDefault 不影响打开；
      //   · 触屏：打开由 onClick 的 handleOpen 完成，**不能** preventDefault，
      //     故按 pointerType 分流。
      // 我们自己用 preventScroll 聚焦，保住键盘焦点语义与 focus-visible 环。
      {...props}
      onPointerDown={(event) => {
        pointerTypeRef.current = event.pointerType || "mouse";
        props.onPointerDown?.(event);
      }}
      onClick={(event) => {
        if (pointerTypeRef.current === "mouse") event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        props.onClick?.(event);
      }}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

/** 顶部滚动按钮(选项过多时显示) */
const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

/** 底部滚动按钮(选项过多时显示) */
const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

/** 下拉内容：popper 定位。默认无动画（对齐原站原生选择器的即时开合）。 */
const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          // 零动效（大爷 2026-10-05 定案「点规格样式不动」）：原站规格选择器是原生
          // radio，点击即选中，面板**瞬时出现/收起、无任何过渡**。此前 zoom-in-95 +
          // slide-in-from-* 是「面板在动」的主因（实测 150-300ms CSSAnimation），
          // 仅保留 fade 也仍有可感知的淡入。这里彻底去掉动画，点开即现、选完即收。
          "relative z-[60] max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className,
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});
SelectContent.displayName = SelectPrimitive.Content.displayName;

/** 分组标签 */
const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("py-1.5 pl-2 pr-8 text-sm font-semibold", className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

/** 单个选项：选中态右侧显示 Check 图标 */
const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

/** 分组分隔线 */
const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
