import { describe, expect, it } from "vitest";
import { htmlToPreviewHtml, htmlToText, isBlankHtml, PREVIEW_LIMITS } from "~/domain/notes/html";

describe("HTML → düz metin", () => {
  it("paragraf ve başlıkları satırlara çevirir", () => {
    expect(htmlToText("<p>Birinci</p><h2>Mutfak</h2><p>İkinci</p>")).toBe(
      "Birinci\nMutfak\nİkinci",
    );
  });

  it("satır içi biçimleri ve bağlantıları metin olarak bırakır", () => {
    expect(
      htmlToText(
        '<p><strong>Salon:</strong> duvar <em>gri</em>, <a href="https://x.y">teklif</a></p>',
      ),
    ).toBe("Salon: duvar gri, teklif");
  });

  it("liste öğelerini ayrı satırlara koyar", () => {
    expect(htmlToText("<ul><li><p>Bir</p></li><li><p>İki</p></li></ul>")).toBe("Bir\nİki");
  });

  it("<br> satır sonu olur, varlıklar çözülür", () => {
    expect(
      htmlToText("<p>a<br>b &amp; c &lt;d&gt; &quot;e&quot; &#39;f&#39; &nbsp;g &#x41;</p>"),
    ).toBe("a\nb & c <d> \"e\" 'f' g A");
  });

  it("betik ve stil içeriğini atar, fazla boşlukları sadeleştirir", () => {
    expect(htmlToText("<p>  çok   boşluk </p><script>alert(1)</script><style>p{}</style>")).toBe(
      "çok boşluk",
    );
  });

  it("boş ya da tanımsız girdi boş metin verir", () => {
    expect(htmlToText("")).toBe("");
    expect(htmlToText(null)).toBe("");
    expect(htmlToText("<p></p><p> </p>")).toBe("");
  });

  it("boş gövde algılanır", () => {
    expect(isBlankHtml("<p></p>")).toBe(true);
    expect(isBlankHtml(undefined)).toBe(true);
    expect(isBlankHtml("<p>x</p>")).toBe(false);
  });
});

describe("kartın biçimli önizlemesi", () => {
  it("kalın, italik, üstü çizili ve başlığı korur; başlık sınıflı paragraf olur", () => {
    expect(
      htmlToPreviewHtml(
        "<h2>Mutfak</h2><p><strong>Salon:</strong> <em>gri</em> <s>beyaz</s></p><h3>Alt</h3>",
      ),
    ).toBe(
      '<p class="pv-h">Mutfak</p><p><strong>Salon:</strong> <em>gri</em> <s>beyaz</s></p><p class="pv-h">Alt</p>',
    );
  });

  it("madde ve numaralı listeleri, iç listeleri korur", () => {
    expect(
      htmlToPreviewHtml(
        "<ul><li><p>Bir</p><ul><li><p>İç</p></li></ul></li></ul><ol><li><p>a</p></li><li><p>b</p></li></ol>",
      ),
    ).toBe("<ul><li>Bir<ul><li>İç</li></ul></li></ul><ol><li>a</li><li>b</li></ol>");
  });

  it("satır sonlarını ve aradaki boş satırları korur, sondaki boş satırları atar", () => {
    expect(htmlToPreviewHtml("<p>a<br>b</p><p></p><p>c</p><p></p><p></p>")).toBe(
      "<p>a<br>b</p><p><br></p><p>c</p>",
    );
  });

  it("bağlantı gezinmeyen biçimli metin olur; adres taşınmaz", () => {
    const out = htmlToPreviewHtml('<p>Bkz. <a href="https://ornek.com">teklif</a></p>');
    expect(out).toBe('<p>Bkz. <span class="pv-a">teklif</span></p>');
    expect(out).not.toContain("href");
  });

  it("betikleri, öznitelikleri ve bilinmeyen etiketleri atar; metni kaçışlar", () => {
    const out = htmlToPreviewHtml(
      '<p onclick="x()" style="color:red"><img src=x onerror=alert(1)>a &lt;b&gt;<script>alert(1)</script><u>altı</u></p><iframe src="//kötü"></iframe>',
    );
    expect(out).toBe("<p>a &lt;b&gt;altı</p>");
  });

  it("uzun gövdeyi kısaltır ve sonuna … koyar", () => {
    const long = Array.from({ length: 40 }, (_, i) => `<p>Satır ${i} ${"x".repeat(40)}</p>`).join(
      "",
    );
    const out = htmlToPreviewHtml(long);
    expect(out.match(/<p>/g)!.length).toBeLessThanOrEqual(PREVIEW_LIMITS.blocks);
    expect(htmlToText(out).length).toBeLessThanOrEqual(PREVIEW_LIMITS.chars + 20);
    const words = htmlToPreviewHtml(`<p>${"kelime ".repeat(300)}</p>`);
    expect(words.endsWith("…</p>")).toBe(true);
  });

  it("boş gövde boş önizleme verir", () => {
    expect(htmlToPreviewHtml("")).toBe("");
    expect(htmlToPreviewHtml(null)).toBe("");
    expect(htmlToPreviewHtml("<p></p><p> </p>")).toBe("");
  });

  it("çıplak metni ve tek başına liste öğesini sarar", () => {
    expect(htmlToPreviewHtml("yalnız <b>metin</b>")).toBe("<p>yalnız <strong>metin</strong></p>");
    expect(htmlToPreviewHtml("<li>tek</li>")).toBe("<ul><li>tek</li></ul>");
  });
});
