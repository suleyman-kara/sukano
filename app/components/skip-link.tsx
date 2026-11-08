/**
 * "İçeriğe geç": sayfanın ilk odaklanılabilir öğesi; ekranın üstünde gizli durur, klavye
 * odağında görünür (WCAG 2.4.1). Hedef `<main id="icerik" tabIndex={-1}>`.
 */
export function SkipLink() {
  return (
    <a
      href="#icerik"
      className="fixed top-3 left-3 z-[60] -translate-y-[calc(100%+24px)] rounded-[10px] border border-line bg-surface px-4 py-2.5 font-medium text-fg shadow-elevated outline-none focus:translate-y-0 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      İçeriğe geç
    </a>
  );
}
