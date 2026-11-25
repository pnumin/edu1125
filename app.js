"use strict";

const form = document.querySelector("#trip-form");
const get = (id) => document.getElementById(id);
const field = (name) => form.elements.namedItem(name);
const total = get("total");
const breakdown = get("breakdown");
const errorText = get("error");
const resultActions = get("result-actions");
const saveExcel = get("save-excel");
const exportError = get("export-error");
const hotels = get("hotels");
const savedHotels = { KRW: document.createDocumentFragment(), USD: document.createDocumentFragment() };
const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "UTC" });
let hotelId = 0;
let currentReport = null;

get("open-manual").addEventListener("click", () => get("manual").showModal());

function isForeign() {
  return field("type").value === "foreign";
}

function isActual() {
  return field("group").value === "actual";
}

function show(container, visible) {
  container.hidden = !visible;
  if (container instanceof HTMLFieldSetElement) container.disabled = !visible;
}

function resetResult(message) {
  total.textContent = "–";
  get("result-meta").textContent = message;
  get("result-note").hidden = true;
  resultActions.hidden = true;
  exportError.hidden = true;
  printRows(["운임", "일비", "숙박비", "식비"].map((name) => ({ name })));
  currentReport = null;
}

function printRows(rows) {
  breakdown.replaceChildren();
  for (const { name, amount, detail } of rows) {
    const item = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = name;
    const value = document.createElement("strong");
    value.textContent = amount == null ? "–" : TravelCalculator.won(amount);
    item.append(label, value);
    if (detail) {
      const description = document.createElement("p");
      description.textContent = [detail].flat().join("\n");
      item.append(description);
    }
    breakdown.append(item);
  }
}

function updateHotels() {
  const foreign = isForeign();
  const hasCap = !isActual() && (foreign || field("group").value === "2");
  for (const [index, row] of Array.from(hotels.children).entries()) {
    row.querySelector(".hotel-title").textContent = `숙박 ${index + 1}박`;
    row.querySelector(".cost-unit").textContent = foreign ? "(USD)" : "(원)";
    row.querySelector(".cost").step = foreign ? "0.01" : "1";
    row.querySelector(".cost").max = foreign ? "10000000" : "1000000000";
    const region = row.querySelector(".region");
    show(region.parentElement, !foreign && hasCap);
    region.disabled = foreign || !hasCap;
    region.required = !region.disabled;
    const extra = row.querySelector(".extra");
    show(extra.parentElement, hasCap);
    extra.disabled = !hasCap;
  }
}

function updateForm() {
  const local = field("type").value === "local";
  const foreign = isForeign();
  const actual = isActual();
  show(get("local-fields"), local);
  show(get("travel-fields"), !local);
  show(get("hotel-fields"), !local);
  show(get("foreign-fields"), foreign);
  show(get("actual-fields"), actual);
  for (const name of ["actualDaily", "actualMeals"]) {
    field(name).disabled = !actual;
    field(name).required = actual;
  }
  for (const name of ["half", "stay", "mealDays", "mileage", "extraMeal", "grade"]) {
    field(name).disabled = actual;
    if (actual && field(name).type === "checkbox") field(name).checked = false;
  }
  field("duration").required = local;
  show(get("local-cost"), field("shortDistance").checked);
  field("localCost").disabled = !field("shortDistance").checked;
  field("localCost").required = local && field("shortDistance").checked;
  field("grade").required = foreign && !actual;
  field("rate").required = foreign;
  show(get("fare-hint").nextElementSibling, !actual);
  show(get("fare-hint").nextElementSibling.nextElementSibling, !actual);
  show(get("travel-fields").querySelector("details"), !actual);
  show(field("grade").parentElement, !actual);
  show(field("extraMeal").parentElement, !actual);
  show(field("extraMeal").parentElement.nextElementSibling, !actual);
  get("fare-hint").textContent = foreign
    ? "좌석 등급과 구간별 지급 기준을 적용한 원화 인정액을 입력하세요. 공용 교통수단을 이용한 구간의 운임은 제외합니다."
    : "지급 등급 및 할인 적용 후 인정 운임을 입력하세요. 공용 교통수단을 이용한 구간의 운임은 제외합니다.";
  get("foreign-hint").textContent = actual ? "USD 숙박 증빙에 적용할 기관 환율을 입력하세요."
    : "담당자가 확인한 국가·도시 등급과 기관 적용 환율을 입력하세요. 여정 전체에 한 등급을 적용합니다.";
  get("hotel-hint").textContent = foreign
    ? "숙박 증빙을 USD로 환산해 1박씩 입력하세요. 할인 가능 요금을 적용하고, 수로·항공 여행 중 숙박분은 부득이한 육지 숙박에 한해 입력하세요."
    : "실제 숙박분을 1박씩 추가하세요. 할인 가능 요금을 적용하고, 수로·항공 여행 중 숙박분은 부득이한 육지 숙박에 한해 입력하세요.";
  field("end").min = field("start").value || field("start").min;
  const days = TravelCalculator.travelDays(field("start").value, field("end").value);
  get("period").textContent = days ? `여행일수 ${days}일`
    : field("start").value && field("end").value ? "복귀일은 출장일과 같거나 이후여야 합니다." : "출장일과 복귀일을 모두 입력하세요.";
  updateHotels();
}

function markChanged() {
  errorText.hidden = true;
  if (currentReport) resetResult("입력이 변경되었습니다. 다시 계산해 주세요.");
}

get("add-hotel").addEventListener("click", () => {
  const days = TravelCalculator.travelDays(field("start").value, field("end").value);
  if (!days || hotels.children.length >= days - 1) {
    errorText.textContent = days ? `출장 기간에는 최대 ${days - 1}박까지 추가할 수 있습니다.` : "숙박을 추가하기 전에 출장일과 복귀일을 입력하세요.";
    errorText.hidden = false;
    errorText.focus();
    return;
  }
  const row = document.createElement("div");
  row.className = "hotel";
  hotelId += 1;
  row.innerHTML = `<div class="hotel-head"><strong class="hotel-title"></strong><button type="button" class="remove">삭제</button></div>
    <div class="grid">
      <label>숙박 지역<select class="region">
        <option value="">선택하세요</option><option value="seoul">서울특별시</option><option value="metro">광역시</option><option value="other">그 밖의 지역</option>
      </select></label>
      <label>증빙 금액 <span class="cost-unit light"></span><input class="cost" type="number" id="hotel-${hotelId}" min="0" required placeholder="0"></label>
    </div>
    <label class="check"><input class="extra" type="checkbox"> 부득이한 사유로 상한 초과분 추가 지급 인정</label>`;
  row.querySelector(".remove").addEventListener("click", () => {
    row.remove();
    updateHotels();
    markChanged();
    get("add-hotel").focus();
  });
  hotels.append(row);
  updateHotels();
  markChanged();
  (row.querySelector(".region").disabled ? row.querySelector(".cost") : row.querySelector(".region")).focus();
});

form.addEventListener("input", (event) => {
  if (event.target.name === "type") {
    const previousCurrency = form.dataset.currency;
    const currentCurrency = isForeign() ? "USD" : "KRW";
    if (previousCurrency !== currentCurrency && field("type").value !== "local") {
      savedHotels[previousCurrency].append(...hotels.children);
      hotels.append(savedHotels[currentCurrency]);
      form.dataset.currency = currentCurrency;
    }
  }
  markChanged();
  updateForm();
});

form.addEventListener("reset", () => setTimeout(() => {
  hotels.replaceChildren();
  for (const fragment of Object.values(savedHotels)) fragment.replaceChildren();
  form.dataset.currency = "KRW";
  errorText.hidden = true;
  updateForm();
  resetResult("출장 정보를 입력해 주세요.");
}, 0));

form.addEventListener("invalid", ({ target }) => {
  const options = target.closest("details");
  if (options) options.open = true;
}, true);

get("print-result").addEventListener("click", () => {
  if (currentReport) window.print();
});

saveExcel.addEventListener("click", async () => {
  const report = currentReport;
  if (!report) return;
  exportError.hidden = true;
  saveExcel.disabled = true;
  try {
    const file = await TravelExcel.createFile(report);
    if (report !== currentReport) return;
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `출장여비_${report.start}_${report.end}.xlsx`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch {
    if (report !== currentReport) return;
    exportError.textContent = "엑셀 파일을 만들 수 없습니다. web 폴더의 파일이 모두 있는지 확인한 뒤 다시 시도하세요.";
    exportError.hidden = false;
  } finally {
    saveExcel.disabled = false;
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = (name) => field(name).value;
  const number = (name) => Number(value(name));
  try {
    const result = TravelCalculator.calculate({
      type: value("type"), start: value("start"), end: value("end"),
      duration: value("duration"), localVehicle: value("localVehicle"),
      shortDistance: field("shortDistance").checked, localCost: number("localCost"),
      group: value("group"), fare: number("fare"),
      half: field("half").checked, stay: field("stay").checked,
      actualDaily: number("actualDaily"), actualMeals: number("actualMeals"),
      mealDays: isActual() || value("mealDays") === "" ? null : number("mealDays"),
      mileage: number("mileage"), grade: value("grade"), rate: number("rate"),
      extraMeal: number("extraMeal"), preparation: number("preparation"),
      hotels: Array.from(hotels.children, (row) => ({
        region: row.querySelector(".region").value, cost: row.querySelector(".cost").valueAsNumber,
        extra: row.querySelector(".extra").checked && !row.querySelector(".extra").disabled
      }))
    });
    const totalAmount = result.rows.reduce((sum, item) => sum + item.amount, 0);
    total.textContent = TravelCalculator.won(totalAmount);
    const start = value("start");
    const end = value("end");
    const dates = [start, end].map((date) => dateFormat.format(new Date(date)));
    const tripType = form.querySelector('input[name="type"]:checked').parentElement.textContent.trim();
    get("result-meta").textContent = `${tripType} · ${dates.join(" ~ ")} · ${result.days}일${result.nights ? ` · 증빙 숙박 ${result.nights}박` : ""}`;
    printRows(result.rows);
    get("result-note").textContent = result.notes?.join(" ") ?? "";
    get("result-note").hidden = !result.notes?.length;
    errorText.hidden = true;
    currentReport = { ...result, tripType, start, end, total: totalAmount };
    resultActions.hidden = false;
    exportError.hidden = true;
    get("result-heading").focus();
  } catch (error) {
    resetResult("입력 조건을 확인해 주세요.");
    errorText.textContent = error.message;
    errorText.hidden = false;
    errorText.focus();
  }
});

form.dataset.currency = "KRW";
updateForm();
