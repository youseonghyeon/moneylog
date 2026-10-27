// 넓은 화면(860px 이상, 2단)인가. PC 는 오른쪽에, 휴대폰은 제자리에 펼치는 화면이 같이 쓴다
import { useEffect, useState } from "preact/hooks";

const WIDE = "(min-width: 860px)";

export function useWide(): boolean {
  const [wide, setWide] = useState(() => matchMedia(WIDE).matches);
  useEffect(() => {
    const on = () => setWide(matchMedia(WIDE).matches);
    window.addEventListener("resize", on);
    // 그린 뒤 리스너를 붙이기 전에 화면 폭이 바뀌었을 수 있다 — 붙이자마자 한 번 다시 잰다
    on();
    return () => window.removeEventListener("resize", on);
  }, []);
  return wide;
}
