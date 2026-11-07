import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatePicker, type DatePickerProps } from "~/components/tasks/date-picker";
import type { DateSlot } from "~/domain/tasks/dates";
import { initial } from "./ornek";
import { caretAt, fakeServer, renderEditor, titleInput } from "./editor-yardimci";

const TODAY = "2026-11-06";

function Harness(props: Partial<DatePickerProps> & { onSubmit?: (t: string) => void }) {
  const [slot, setSlot] = useState<DateSlot>("due");
  const [text, setText] = useState("");
  return (
    <DatePicker
      startDate={null}
      dueDate={null}
      dueTime={null}
      today={TODAY}
      slot={slot}
      onSlot={setSlot}
      timeOpen={false}
      onToggleTime={vi.fn()}
      onTime={vi.fn()}
      warning={null}
      text={text}
      textError={false}
      onText={setText}
      onTextSubmit={props.onSubmit ?? vi.fn()}
      onPick={vi.fn()}
      onClear={vi.fn()}
      {...props}
    />
  );
}

describe("DatePicker", () => {
  it("iki yuva ve ok: varsayılan etkin yuva bitiş; başlangıca geçilebilir", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Bitiş tarihi" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Başlangıç tarihi" }));
    expect(screen.getByRole("button", { name: "Başlangıç tarihi" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "Başlangıç tarihini yaz" })).toBeInTheDocument();
  });

  it("hızlı seçenekler gün adlarıyla; takvim Pazartesi başlar ve Türkçe", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<Harness onPick={onPick} />);
    expect(screen.getByRole("button", { name: "Bugün Cum" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yarın Cmt" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Gelecek hafta Pzt, 9 Kas" }));
    expect(onPick).toHaveBeenLastCalledWith("2026-11-09");
    const cal = screen.getByRole("group", { name: "Kasım 2026" });
    expect(within(cal).getByRole("button", { name: "6 Kasım" })).toHaveAttribute(
      "aria-current",
      "date",
    );
    await user.click(screen.getByRole("button", { name: "Sonraki ay" }));
    const dec = screen.getByRole("group", { name: "Aralık 2026" });
    await user.click(within(dec).getByRole("button", { name: "24 Aralık" }));
    expect(onPick).toHaveBeenLastCalledWith("2026-12-24");
    await user.click(screen.getByRole("button", { name: "Önceki ay" }));
    await user.click(screen.getByRole("button", { name: "Önceki ay" }));
    expect(screen.getByRole("group", { name: "Ekim 2026" })).toBeInTheDocument();
  });

  it("aralık vurgusu: başlangıç, aradaki günler ve bitiş", () => {
    render(<Harness startDate="2026-11-03" dueDate="2026-11-12" />);
    const cal = screen.getByRole("group", { name: "Kasım 2026" });
    expect(within(cal).getByRole("button", { name: "3 Kasım" })).toHaveAttribute(
      "data-range",
      "start",
    );
    expect(within(cal).getByRole("button", { name: "7 Kasım" })).toHaveAttribute(
      "data-range",
      "in",
    );
    expect(within(cal).getByRole("button", { name: "12 Kasım" })).toHaveAttribute(
      "data-range",
      "due",
    );
    expect(within(cal).getByRole("button", { name: "13 Kasım" })).not.toHaveAttribute("data-range");
    expect(screen.getByRole("button", { name: "Başlangıç tarihi: 3 Kas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bitiş tarihi: 12 Kas" })).toBeInTheDocument();
  });

  it("doğal yazım Enter ile gönderilir; hata metni gösterilir", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<Harness onSubmit={onSubmit} />);
    await user.type(screen.getByRole("textbox", { name: "Bitiş tarihini yaz" }), "15 kasım{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("15 kasım");
    rerender(<Harness onSubmit={onSubmit} textError />);
    expect(screen.getByText("Anlaşılmadı · ör. yarın, cuma, 15 kasım")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Bitiş tarihini yaz" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("Tarihleri temizle, saat düğmesi ve devre dışı Hatırlat ('Sana gider')", async () => {
    const onClear = vi.fn();
    const onToggleTime = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness
        onClear={onClear}
        onToggleTime={onToggleTime}
        dueDate="2026-11-12"
        dueTime="17:00"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Tarihleri temizle" }));
    expect(onClear).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Saat 17:00" }));
    expect(onToggleTime).toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: "Hatırlat" })).toBeDisabled();
    expect(screen.getByText("Sana gider")).toBeInTheDocument();
  });
});

describe("tarih seçici editörde", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-11-06T09:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  async function openFor(title: string) {
    const user = userEvent.setup();
    caretAt(titleInput(title), "end");
    await user.keyboard("{Control>}d{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Tarih" });
    return { user, dialog };
  }

  it("başlangıç bitişten sonra seçilirse bitişe eşitlenir ve uyarı gösterilir", async () => {
    const server = fakeServer(initial());
    renderEditor(initial());
    const { user, dialog } = await openFor("İçerik yazımı");
    await user.click(within(dialog).getByRole("button", { name: /^Başlangıç tarihi/ }));
    await user.click(within(dialog).getByRole("button", { name: "20 Kasım" }));
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Başlangıç bitişten sonra olamaz; bitişe eşitlendi.",
    );
    // Seçimden sonra etkin yuva bitişe döner.
    expect(within(dialog).getByRole("button", { name: /^Bitiş tarihi/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() =>
      expect(server.tasks().find((t) => t.id === "t2")).toMatchObject({
        startDate: "2026-11-12",
        dueDate: "2026-11-12",
      }),
    );
  });

  it("başlangıç yazılınca seçici açık kalır ve bitiş yuvasına geçer", async () => {
    fakeServer(initial());
    renderEditor(initial());
    const { user, dialog } = await openFor("Lansman duyurusu");
    await user.click(within(dialog).getByRole("button", { name: /^Başlangıç tarihi/ }));
    await user.click(within(dialog).getByRole("textbox", { name: "Başlangıç tarihini yaz" }));
    await user.keyboard("pazartesi{Enter}");
    expect(screen.getByRole("dialog", { name: "Tarih" })).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Başlangıç tarihi: 9 Kas" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Bitiş tarihini yaz" })).toBeInTheDocument();
  });

  it("anlaşılmayan yazım hata gösterir; Tarihleri temizle kapatır ve tarihleri siler", async () => {
    const server = fakeServer(initial());
    const { container } = renderEditor(initial());
    const { user, dialog } = await openFor("SEO kontrolleri");
    await user.keyboard("bir ara{Enter}");
    expect(within(dialog).getByText("Anlaşılmadı · ör. yarın, cuma, 15 kasım")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Tarihleri temizle" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Tarih" })).toBeNull());
    expect(container.querySelector('[data-task-row="t3"]')).not.toHaveTextContent("4 Kas");
    await waitFor(() => expect(server.tasks().find((t) => t.id === "t3")!.dueDate).toBeNull());
  });

  it("saat girilince bitiş yoksa bugün olur", async () => {
    const server = fakeServer(initial());
    renderEditor(initial());
    const { user, dialog } = await openFor("Lansman duyurusu");
    await user.click(within(dialog).getByRole("button", { name: "Tarihleri temizle" }));
    caretAt(titleInput("Lansman duyurusu"), "end");
    await user.keyboard("{Control>}d{/Control}");
    const again = await screen.findByRole("dialog", { name: "Tarih" });
    await user.click(within(again).getByRole("button", { name: "Saat ekle" }));
    const time = within(again).getByLabelText("Bitiş saati");
    fireEvent.change(time, { target: { value: "09:30" } });
    expect(within(again).getByRole("status")).toHaveTextContent(
      "Saat için bitiş tarihi bugün olarak ayarlandı.",
    );
    await waitFor(() =>
      expect(server.tasks().find((t) => t.id === "t6")).toMatchObject({ dueDate: "2026-11-06" }),
    );
  });
});
