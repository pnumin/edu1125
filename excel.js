"use strict";

const TravelExcel = (() => {
  const workbookMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const spreadsheet = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const officeRelations = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const packageRelations = "http://schemas.openxmlformats.org/package/2006/relationships";
  const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const style = { normal: 0, title: 1, heading: 2, amount: 3, total: 4, date: 5, label: 6 };

  function escapeXml(value) {
    return String(value).replace(/[&<>]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;"
    })[character]);
  }

  function dateSerial(date) {
    return Date.parse(`${date}T00:00:00Z`) / 86_400_000 + 25_569;
  }

  function worksheet(report) {
    const rows = [];
    const merges = [];

    function add(cells, height = 22) {
      const row = rows.length + 1;
      const body = cells.map(([ref, value, cellStyle = style.normal]) => {
        const address = `r="${ref}${row}" s="${cellStyle}"`;
        return typeof value === "number"
          ? `<c ${address}><v>${value}</v></c>`
          : `<c ${address} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
      });
      rows.push(`<row r="${row}" ht="${height}" customHeight="1">${body.join("")}</row>`);
    }

    function mergeFrom(column) {
      merges.push(`<mergeCell ref="${column}${rows.length}:C${rows.length}"/>`);
    }

    function addSummary(label, value, cellStyle = style.normal) {
      add([["A", label, style.label], ["B", value, cellStyle]]);
      mergeFrom("B");
    }

    add([["A", "출장여비 정산 결과", style.title]], 34);
    mergeFrom("A");
    addSummary("출장 유형", report.tripType);
    addSummary("출장일", dateSerial(report.start), style.date);
    addSummary("복귀일", dateSerial(report.end), style.date);
    addSummary("여행일수", report.days);
    addSummary("증빙 숙박 횟수", report.nights);
    add([["A", "총 인정액 (원)", style.heading], ["B", report.total, style.total]], 28);
    add([], 9);
    add([["A", "항목", style.heading], ["B", "인정액 (원)", style.heading], ["C", "계산 근거", style.heading]], 24);

    for (const item of report.rows) {
      const details = [item.detail].flat();
      add([["A", item.name, style.label], ["B", item.amount, style.amount], ["C", details[0] ?? ""]], 34);
      for (const line of details.slice(1)) add([["C", line]], 30);
    }

    if (report.notes?.length) {
      add([], 9);
      for (const [index, note] of report.notes.entries()) {
        add([["A", index === 0 ? "정산 안내" : "", style.label], ["B", note]], 39);
        mergeFrom("B");
      }
    }

    return `${xmlHeader}<worksheet xmlns="${spreadsheet}">
      <dimension ref="A1:C${rows.length}"/>
      <sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>
      <cols><col min="1" max="1" width="32" customWidth="1"/><col min="2" max="2" width="19" customWidth="1"/><col min="3" max="3" width="76" customWidth="1"/></cols>
      <sheetData>${rows.join("")}</sheetData>
      <mergeCells count="${merges.length}">${merges.join("")}</mergeCells>
    </worksheet>`;
  }

  const styles = `${xmlHeader}<styleSheet xmlns="${spreadsheet}">
    <numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>
    <fonts count="4">
      <font><sz val="11"/><color rgb="FF18283B"/><name val="Malgun Gothic"/></font>
      <font><b/><sz val="18"/><color rgb="FF132A43"/><name val="Malgun Gothic"/></font>
      <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Malgun Gothic"/></font>
      <font><b/><sz val="11"/><color rgb="FF132A43"/><name val="Malgun Gothic"/></font>
    </fonts>
    <fills count="4">
      <fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
      <fill><patternFill patternType="solid"><fgColor rgb="FF132A43"/><bgColor indexed="64"/></patternFill></fill>
      <fill><patternFill patternType="solid"><fgColor rgb="FFE9F7F3"/><bgColor indexed="64"/></patternFill></fill>
    </fills>
    <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
    <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
    <cellXfs count="7">
      <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
      <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
      <xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
      <xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf>
      <xf numFmtId="3" fontId="3" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
      <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
      <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    </cellXfs>
    <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  </styleSheet>`;

  function createFile(report) {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `${xmlHeader}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="${workbookMime}.main+xml"/>
      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="${spreadsheetMime("worksheet")}"/>
      <Override PartName="/xl/styles.xml" ContentType="${spreadsheetMime("styles")}"/>
    </Types>`);
    zip.file("_rels/.rels", `${xmlHeader}<Relationships xmlns="${packageRelations}">
      <Relationship Id="rId1" Type="${officeRelations}/officeDocument" Target="xl/workbook.xml"/>
    </Relationships>`);
    zip.file("xl/workbook.xml", `${xmlHeader}<workbook xmlns="${spreadsheet}" xmlns:r="${officeRelations}">
      <bookViews><workbookView/></bookViews><sheets><sheet name="정산 결과" sheetId="1" r:id="rId1"/></sheets>
    </workbook>`);
    zip.file("xl/_rels/workbook.xml.rels", `${xmlHeader}<Relationships xmlns="${packageRelations}">
      <Relationship Id="rId1" Type="${officeRelations}/worksheet" Target="worksheets/sheet1.xml"/>
      <Relationship Id="rId2" Type="${officeRelations}/styles" Target="styles.xml"/>
    </Relationships>`);
    zip.file("xl/styles.xml", styles);
    zip.file("xl/worksheets/sheet1.xml", worksheet(report));
    return zip.generateAsync({ type: "blob", mimeType: workbookMime, compression: "DEFLATE" });
  }

  function spreadsheetMime(part) {
    return `application/vnd.openxmlformats-officedocument.spreadsheetml.${part}+xml`;
  }

  return { createFile };
})();
