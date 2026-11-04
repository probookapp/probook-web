/**
 * Turn an invoice PDF into a Factur-X: a PDF/A-3 carrying its CII XML
 * (src/lib/facturx.ts) as the associated file "factur-x.xml".
 *
 * What PDF/A-3b and the Factur-X specification ask on top of the PDF itself:
 * - the XML embedded with AFRelationship /Alternative and listed in /AF;
 * - an XMP metadata stream declaring pdfaid part 3 / conformance B and the
 *   Factur-X extension schema (fx:DocumentType, DocumentFileName, Version,
 *   ConformanceLevel), with the same title, author and dates as the Info
 *   dictionary;
 * - an sRGB OutputIntent;
 * - a file identifier in the trailer.
 * Fonts must be embedded: the document is drawn with the registered IBM Plex
 * faces (register-client-fonts.ts), never the unembedded standard Helvetica.
 */
import { AFRelationship, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString } from "pdf-lib";

export const FACTURX_FILE_NAME = "factur-x.xml";

/** A minimal ICC v2 display profile for sRGB (D50, gamma 2.2), built in place. */
export function srgbIccProfile(): Uint8Array {
  const s15 = (v: number) => Math.round(v * 65536);
  const tags: Array<{ sig: string; data: number[] }> = [];
  const ascii = (str: string) => [...str].map((c) => c.charCodeAt(0));
  const u32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const u16 = (v: number) => [(v >>> 8) & 255, v & 255];
  const xyz = (x: number, y: number, z: number) => [...ascii("XYZ "), 0, 0, 0, 0, ...u32(s15(x)), ...u32(s15(y)), ...u32(s15(z))];
  const desc = (text: string) => {
    const bytes = [...ascii(text), 0];
    return [...ascii("desc"), 0, 0, 0, 0, ...u32(bytes.length), ...bytes, ...u32(0), ...u32(0), ...u16(0), 0, ...new Array(67).fill(0)];
  };
  const curve = [...ascii("curv"), 0, 0, 0, 0, ...u32(1), ...u16(Math.round(2.2 * 256)), 0, 0];
  tags.push({ sig: "desc", data: desc("sRGB IEC61966-2.1") });
  tags.push({ sig: "cprt", data: [...ascii("text"), 0, 0, 0, 0, ...ascii("No copyright, use freely"), 0] });
  tags.push({ sig: "wtpt", data: xyz(0.9642, 1.0, 0.8249) });
  tags.push({ sig: "rXYZ", data: xyz(0.4361, 0.2225, 0.0139) });
  tags.push({ sig: "gXYZ", data: xyz(0.3851, 0.7169, 0.0971) });
  tags.push({ sig: "bXYZ", data: xyz(0.1431, 0.0606, 0.7141) });
  tags.push({ sig: "rTRC", data: curve });
  tags.push({ sig: "gTRC", data: curve });
  tags.push({ sig: "bTRC", data: curve });

  const pad4 = (n: number) => (n + 3) & ~3;
  let offset = 128 + 4 + tags.length * 12;
  const table: number[] = [...u32(tags.length)];
  const body: number[] = [];
  for (const tag of tags) {
    table.push(...ascii(tag.sig), ...u32(offset), ...u32(tag.data.length));
    const padded = [...tag.data, ...new Array(pad4(tag.data.length) - tag.data.length).fill(0)];
    body.push(...padded);
    offset += padded.length;
  }
  const size = 128 + table.length + body.length;
  const header = [
    ...u32(size),
    0, 0, 0, 0, // preferred CMM
    0x02, 0x10, 0, 0, // version 2.1
    ...ascii("mntr"),
    ...ascii("RGB "),
    ...ascii("XYZ "),
    ...u16(2026), ...u16(1), ...u16(1), 0, 0, 0, 0, 0, 0,
    ...ascii("acsp"),
    0, 0, 0, 0, // platform
    0, 0, 0, 0, // flags
    0, 0, 0, 0, // manufacturer
    0, 0, 0, 0, // model
    0, 0, 0, 0, 0, 0, 0, 0, // attributes
    0, 0, 0, 0, // perceptual intent
    ...u32(s15(0.9642)), ...u32(s15(1.0)), ...u32(s15(0.8249)), // D50 illuminant
    0, 0, 0, 0, // creator
  ];
  while (header.length < 128) header.push(0);
  return Uint8Array.from([...header, ...table, ...body]);
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** XMP dates and PDF dates must agree to the second (PDF/A-3 6.6.3). */
const xmpDate = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

function xmpPacket(meta: { title: string; author: string; producer: string; date: Date }): string {
  const property = (name: string, description: string) =>
    `<rdf:li rdf:parseType="Resource"><pdfaProperty:name>${name}</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>${description}</pdfaProperty:description></rdf:li>`;
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description>
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(meta.title)}</rdf:li></rdf:Alt></dc:title><dc:creator><rdf:Seq><rdf:li>${xmlEscape(meta.author)}</rdf:li></rdf:Seq></dc:creator></rdf:Description>
<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"><pdf:Producer>${xmlEscape(meta.producer)}</pdf:Producer></rdf:Description>
<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreatorTool>${xmlEscape(meta.producer)}</xmp:CreatorTool><xmp:CreateDate>${xmpDate(meta.date)}</xmp:CreateDate><xmp:ModifyDate>${xmpDate(meta.date)}</xmp:ModifyDate></rdf:Description>
<rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
<pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">
<pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
<pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
<pdfaSchema:prefix>fx</pdfaSchema:prefix>
<pdfaSchema:property><rdf:Seq>
${property("DocumentFileName", "name of the embedded XML invoice file")}
${property("DocumentType", "INVOICE")}
${property("Version", "The actual version of the Factur-X XML schema")}
${property("ConformanceLevel", "The conformance level of the embedded Factur-X data")}
</rdf:Seq></pdfaSchema:property>
</rdf:li></rdf:Bag></pdfaExtension:schemas>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:DocumentType>INVOICE</fx:DocumentType><fx:DocumentFileName>${FACTURX_FILE_NAME}</fx:DocumentFileName><fx:Version>1.0</fx:Version><fx:ConformanceLevel>EN 16931</fx:ConformanceLevel></rdf:Description>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

export async function embedFacturx(
  pdfBytes: Uint8Array | ArrayBuffer,
  xml: string,
  meta: { title: string; author: string; date?: Date }
): Promise<Uint8Array> {
  // Seconds only: the Info dictionary cannot hold milliseconds, and the two
  // dates must be equal.
  const date = new Date(Math.floor((meta.date ?? new Date()).getTime() / 1000) * 1000);
  const producer = "Probook";
  const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const context = doc.context;

  doc.setTitle(meta.title, { showInWindowTitleBar: true });
  doc.setAuthor(meta.author);
  doc.setProducer(producer);
  doc.setCreator(producer);
  doc.setCreationDate(date);
  doc.setModificationDate(date);

  await doc.attach(new TextEncoder().encode(xml), FACTURX_FILE_NAME, {
    mimeType: "text/xml",
    description: "Factur-X invoice",
    creationDate: date,
    modificationDate: date,
    afRelationship: AFRelationship.Alternative,
  });

  const xmp = new TextEncoder().encode(xmpPacket({ title: meta.title, author: meta.author, producer, date }));
  const metadata = PDFRawStream.of(
    context.obj({ Type: "Metadata", Subtype: "XML", Length: xmp.length }),
    xmp
  );
  doc.catalog.set(PDFName.of("Metadata"), context.register(metadata));

  const icc = context.flateStream(srgbIccProfile(), { N: 3 });
  const outputIntent = context.obj({
    Type: "OutputIntent",
    S: "GTS_PDFA1",
    OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"),
    Info: PDFString.of("sRGB IEC61966-2.1"),
    DestOutputProfile: context.register(icc),
  });
  doc.catalog.set(PDFName.of("OutputIntents"), context.obj([context.register(outputIntent)]));

  // A file identifier, stable for this content (PDF/A-3 6.1.3).
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(xml + date.toISOString())));
  const id = PDFHexString.of([...digest.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join(""));
  context.trailerInfo.ID = context.obj([id, id]);

  return doc.save({ useObjectStreams: false });
}
