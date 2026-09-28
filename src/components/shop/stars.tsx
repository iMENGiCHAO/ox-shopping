import "server-only";

/** 星级展示（只读，评分输入在 review-form 的原生 radio 组） */
export function Stars({ value }: { value: number }) {
  return (
    <span aria-label={`${value} / 5`} className="inline-flex gap-0.5 text-sm">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= value ? "text-foreground" : "text-border"}>
          ★
        </span>
      ))}
    </span>
  );
}
