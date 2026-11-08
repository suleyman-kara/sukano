/**
 * Proje diyaloglarının ortak sınıfları: masaüstü/tablette ortada 400–440 px kart,
 * mobilde alttan açılan sayfa (MNewProject; onaylı sayfalarda Vazgeç + birincil).
 */
export const SHEET_DIALOG =
  "gap-4 rounded-2xl border border-line bg-surface p-6 text-fg shadow-elevated ring-0 sm:max-w-[400px] " +
  "max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-[20px] max-sm:pb-[max(24px,env(safe-area-inset-bottom))] " +
  "[&>[data-slot=dialog-close]]:top-5 [&>[data-slot=dialog-close]]:right-5 max-sm:[&>[data-slot=dialog-close]]:hidden";

export const DIALOG_FOOTER = "flex justify-end gap-2 pt-1 max-sm:[&>*]:h-12 max-sm:[&>*]:flex-1";

export const FIELD_INPUT =
  "h-11 w-full rounded-[10px] border border-line bg-surface px-3 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 aria-invalid:border-danger md:h-10 md:text-sm";

export const FIELD_LABEL = "text-[13px] font-medium";
