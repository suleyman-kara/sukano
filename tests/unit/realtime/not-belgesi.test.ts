import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { noteExtensions, noteSchema } from "~/domain/notes/editor-schema";
import {
  decodeEntities,
  htmlToNoteDoc,
  htmlToNoteJson,
  isEmptyNoteYDoc,
  noteDocToHtml,
  normalizeNoteHtml,
  noteYDocToDoc,
  noteYDocToHtml,
  NOTE_FRAGMENT,
  parseHtmlTree,
  seedNoteYDoc,
} from "~/domain/realtime/note-doc";

const editors: Editor[] = [];
afterEach(() => {
  editors.splice(0).forEach((e) => e.destroy());
});

/** Tarayıcıdaki editörün (DOMParser + DOMSerializer) aynı HTML için çıktısı. */
function editorHtml(html: string): string {
  const editor = new Editor({ extensions: noteExtensions(), content: html });
  editors.push(editor);
  return editor.isEmpty ? "" : editor.getHTML();
}

const SAMPLES = [
  "<p>Merhaba dünya</p>",
  "<h2>Mutfak</h2><p>Duvar <strong>gri</strong>, tavan <em>beyaz</em>.</p>",
  "<ul><li><p>Bir</p></li><li><p>İki</p><ul><li><p>İki-bir</p></li></ul></li></ul>",
  '<p>Teklif: <a target="_blank" rel="noopener noreferrer nofollow" href="https://ornek.com/a?b=1&amp;c=2">bağlantı</a></p>',
  "<p>satır<br>alt satır</p><p></p><p>son</p>",
  "<p><strong><em>kalın italik</em></strong> &amp; &lt;etiket&gt; &quot;tırnak&quot;</p>",
  "<p>Çağrı, Şükrü, İğdır, ılık, ÖÜ</p>",
];

describe("HTML ↔ editör şeması", () => {
  it.each(SAMPLES)("editörün getHTML çıktısıyla aynı HTML'i üretir: %s", (html) => {
    expect(normalizeNoteHtml(html)).toBe(editorHtml(html));
  });

  it("editörün ürettiği JSON ile aynı belgeyi kurar", () => {
    for (const html of SAMPLES) {
      const editor = new Editor({ extensions: noteExtensions(), content: html });
      editors.push(editor);
      expect(htmlToNoteDoc(html).toJSON()).toEqual(editor.getJSON());
    }
  });

  it("boş HTML ve tek boş paragraf boş metne döner", () => {
    expect(normalizeNoteHtml("")).toBe("");
    expect(normalizeNoteHtml(null)).toBe("");
    expect(normalizeNoteHtml("<p></p>")).toBe("");
    expect(htmlToNoteJson("")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("şemada olmayan etiketlerin metnini korur, eşdeğerlerine çevirir", () => {
    expect(normalizeNoteHtml("<h1>Büyük</h1><h4>Küçük</h4>")).toBe("<h2>Büyük</h2><h2>Küçük</h2>");
    expect(normalizeNoteHtml("<ol><li>a</li><li>b</li></ol>")).toBe(
      "<ul><li><p>a</p></li><li><p>b</p></li></ul>",
    );
    expect(normalizeNoteHtml("<p><b>k</b> <i>i</i> <u>altı</u> <code>kod</code></p>")).toBe(
      "<p><strong>k</strong> <em>i</em> altı kod</p>",
    );
    expect(normalizeNoteHtml("<blockquote><p>alıntı</p></blockquote><pre>kod</pre>")).toBe(
      "<p>alıntı</p><p>kod</p>",
    );
    expect(normalizeNoteHtml("<div>düz</div><div><p>iç</p></div>")).toBe("<p>düz</p><p>iç</p>");
  });

  it("çıplak metni ve satır içi öğeleri paragrafa sarar", () => {
    expect(normalizeNoteHtml("yalnız metin")).toBe("<p>yalnız metin</p>");
    expect(normalizeNoteHtml("önce<p>orta</p><strong>sonra</strong>")).toBe(
      "<p>önce</p><p>orta</p><p><strong>sonra</strong></p>",
    );
  });

  it("tehlikeli bağlantıları, betikleri ve yorumları atar", () => {
    expect(normalizeNoteHtml('<p><a href="javascript:alert(1)">tıkla</a></p>')).toBe(
      "<p>tıkla</p>",
    );
    expect(
      normalizeNoteHtml("<p>a<script>alert(1)</script>b<!-- yorum --></p><style>p{}</style>"),
    ).toBe("<p>ab</p>");
  });

  it("kapanmamış etiketleri hoşgörüyle kapatır", () => {
    expect(normalizeNoteHtml("<p>bir<p>iki")).toBe("<p>bir</p><p>iki</p>");
    expect(normalizeNoteHtml("<ul><li>a<li>b</ul>")).toBe(
      "<ul><li><p>a</p></li><li><p>b</p></li></ul>",
    );
    expect(normalizeNoteHtml("<p>a</span>b</p>")).toBe("<p>ab</p>");
  });

  it("liste öğesi paragrafla başlamıyorsa boş paragraf eklenir; tek başına li listeye sarılır", () => {
    expect(normalizeNoteHtml("<ul><li><ul><li>iç</li></ul></li></ul>")).toBe(
      "<ul><li><p></p><ul><li><p>iç</p></li></ul></li></ul>",
    );
    expect(normalizeNoteHtml("<li>tek</li>")).toBe("<ul><li><p>tek</p></li></ul>");
    expect(normalizeNoteHtml("<ul>  </ul><hr><p>x</p>")).toBe("<p>x</p>");
  });

  it("varlıkları çözer; geçersiz sayısal varlığı olduğu gibi bırakır", () => {
    expect(decodeEntities("&#x41;&#66;&nbsp;&apos;&bilinmez;&#0;")).toBe("AB '&bilinmez;&#0;");
    expect(parseHtmlTree("<a href='x' data-y=z disabled>t</a>").children[0]).toMatchObject({
      tag: "a",
      attrs: { href: "x", "data-y": "z", disabled: "" },
    });
  });

  it("şemaya uymayan yapı düz metin paragraflarına düşer", () => {
    // Başlık içinde liste ProseMirror şemasında geçersizdir; metin korunur.
    const doc = htmlToNoteDoc("<h2>başlık<ul><li>madde</li></ul></h2>");
    expect(noteDocToHtml(doc)).toContain("madde");
  });
});

describe("Yjs belgesi", () => {
  it("HTML'den doldurulan belge aynı HTML'e geri döner (gidiş-dönüş)", () => {
    for (const html of SAMPLES) {
      const ydoc = new Y.Doc();
      expect(seedNoteYDoc(ydoc, html)).toBe(true);
      expect(noteYDocToHtml(ydoc)).toBe(editorHtml(html));
    }
  });

  it("dolu belge yeniden doldurulmaz", () => {
    const ydoc = new Y.Doc();
    seedNoteYDoc(ydoc, "<p>ilk</p>");
    expect(seedNoteYDoc(ydoc, "<p>ikinci</p>")).toBe(false);
    expect(noteYDocToHtml(ydoc)).toBe("<p>ilk</p>");
  });

  it("güncellemeyle başka belgeye aktarılan içerik aynı HTML'i verir", () => {
    const a = new Y.Doc();
    seedNoteYDoc(a, SAMPLES[1]!);
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(noteYDocToHtml(b)).toBe(noteYDocToHtml(a));
    expect(noteYDocToDoc(b).toJSON()).toEqual(noteYDocToDoc(a).toJSON());
  });

  it("eşzamanlı iki düzenleme birleşir", () => {
    const a = new Y.Doc();
    seedNoteYDoc(a, "<p>orta</p>");
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const para = (d: Y.Doc) => d.getXmlFragment(NOTE_FRAGMENT).get(0) as Y.XmlElement;
    (para(a).get(0) as Y.XmlText).insert(0, "baş ");
    (para(b).get(0) as Y.XmlText).insert(4, " son");
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(noteYDocToHtml(a)).toBe("<p>baş orta son</p>");
    expect(noteYDocToHtml(b)).toBe("<p>baş orta son</p>");
  });

  it("boş belge boş HTML verir", () => {
    const ydoc = new Y.Doc();
    expect(isEmptyNoteYDoc(ydoc)).toBe(true);
    expect(noteYDocToHtml(ydoc)).toBe("");
    seedNoteYDoc(ydoc, "");
    expect(isEmptyNoteYDoc(ydoc)).toBe(false);
    expect(noteYDocToHtml(ydoc)).toBe("");
  });

  it("şema tek kez kurulur", () => {
    expect(noteSchema()).toBe(noteSchema());
  });
});
