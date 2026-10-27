// 모바일은 아래에서 올라오는 시트, 넓은 화면은 가운데 대화상자 (CSS 가 가른다)
import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";

export function Sheet(props: { title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", onKey);
    document.body.classList.add("locked");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("locked");
    };
  }, []);
  return (
    <div class="backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={props.title}>
        <header class="sheet-head">
          <h2>{props.title}</h2>
          <button type="button" class="icon" aria-label="닫기" onClick={props.onClose}>
            ✕
          </button>
        </header>
        {props.children}
      </div>
    </div>
  );
}
