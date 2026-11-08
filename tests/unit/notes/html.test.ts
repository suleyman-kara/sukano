import { describe, expect, it } from "vitest";
import { htmlToText, isBlankHtml } from "~/domain/notes/html";

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
