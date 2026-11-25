"use strict";

const TravelCalculator = (() => {
  const dayMilliseconds = 86_400_000;
  const effectiveDate = "2026-10-02";
  const domesticCaps = { seoul: 100_000, metro: 80_000, other: 70_000 };
  const foreignRates = {
    "1a": { daily: 60, A: [471, 186], B: [422, 136], C: [271, 102], D: [216, 85] },
    "1b": { daily: 50, A: [389, 160], B: [289, 117], C: [215, 87], D: [161, 73] },
    "1c": { daily: 40, A: [282, 133], B: [207, 99], C: [162, 72], D: [108, 61] },
    "1d": { daily: 35, A: [223, 107], B: [160, 78], C: [130, 58], D: [85, 49] },
    "2":  { daily: 30, A: [176, 81], B: [137, 59], C: [106, 44], D: [81, 37] }
  };
  const format = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
  const won = (amount) => `${format.format(amount)}원`;
  const inCurrency = (amount, foreign) => foreign ? `USD ${format.format(amount)}` : won(amount);

  function readDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const parsed = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
      ? parsed : NaN;
  }

  function travelDays(start, end) {
    const difference = (readDate(end) - readDate(start)) / dayMilliseconds;
    return difference >= 0 ? difference + 1 : 0;
  }

  function dailyFactors(days, continuousStay) {
    // Article 17 counts the stay from the day after arrival.
    const over15 = continuousStay ? Math.max(0, days - 16) : 0;
    const over30 = continuousStay ? Math.max(0, days - 31) : 0;
    const over60 = continuousStay ? Math.max(0, days - 61) : 0;
    return { units: days - (over15 + over30 + over60) / 10, reducedDays: over15 };
  }

  function deadlines(end) {
    const next = (days) => new Date(readDate(end) + days * dayMilliseconds).toISOString().slice(0, 10);
    return { standard: next(14), domesticExtra: next(7) };
  }

  function calculate(data) {
    const days = travelDays(data.start, data.end);
    if (!days) throw new Error("출장일과 복귀일을 확인하세요. 복귀일은 출장일과 같거나 이후여야 합니다.");
    if (data.start < effectiveDate) throw new Error("2026년 10월 2일 이후 출발한 출장에 적용할 수 있습니다.");

    if (data.type === "local") {
      if (days !== 1) throw new Error("근무지 내 출장은 하루씩 계산합니다. 출장일과 복귀일을 같은 날짜로 선택하세요.");
      if (!data.duration) throw new Error("실제 출장 시간을 선택하세요.");
      const base = data.duration === "long" ? 20_000 : 10_000;
      const adjusted = data.localVehicle === "assigned" ? 0 : base - (data.localVehicle === "official" ? 10_000 : 0);
      const amount = data.shortDistance ? Math.min(adjusted, data.localCost) : adjusted;
      const vehicle = { assigned: "전용 차량 배정자는 미지급", official: "공무용 차량 등 이용에 따른 10,000원 감액", none: "차량 관련 감액 없음" };
      return { days, nights: 0, rows: [{
        name: "근무지 내 출장 여비", amount,
        detail: `제18조 · ${data.duration === "long" ? "4시간 이상" : "4시간 미만"} ${won(base)} · ${vehicle[data.localVehicle]}${data.shortDistance ? ` · 왕복 2km 이내 증빙 실비 ${won(data.localCost)}` : ""}`
      }] };
    }

    const foreign = data.type === "foreign";
    const actual = data.group === "actual";
    if (!actual && !Object.hasOwn(foreignRates, data.group)) throw new Error("지급 구분을 선택하세요.");
    if (foreign && !actual && !["A", "B", "C", "D"].includes(data.grade)) throw new Error("국가·도시 등급을 선택하세요.");
    if (foreign && !(data.rate > 0)) throw new Error("기관 적용 환율을 입력하세요.");
    if (data.hotels.length >= days) throw new Error(`출장 기간의 최대 숙박 횟수는 ${days - 1}박입니다.`);
    const mealDays = data.mealDays ?? days;
    if (mealDays > days) throw new Error("식비 지급 대상 일수는 출장일수를 넘을 수 없습니다.");

    const rates = foreign && !actual ? foreignRates[data.group] : null;
    const dailyRate = rates?.daily ?? 25_000;
    const [hotelCap, mealRate] = rates ? rates[data.grade] : [null, 25_000];
    const convert = (amount) => Math.round(amount * (foreign ? data.rate : 1));
    const { units, reducedDays } = dailyFactors(days, data.stay && !actual);
    const daily = actual ? data.actualDaily : convert(dailyRate * units * (data.half ? 0.5 : 1));
    const meals = actual ? data.actualMeals : convert(mealRate * mealDays);
    const extraMeals = rates ? convert(Math.min(data.extraMeal, mealRate * mealDays * 0.5)) : 0;
    const mileage = actual ? 0 : Math.min(Math.floor(daily / 2), data.mileage);

    let additionalLodging = false;
    const hotelRows = data.hotels.map((hotel, index) => {
      const cap = foreign ? hotelCap : (data.group === "2" ? domesticCaps[hotel.region] : null);
      const regular = cap == null ? hotel.cost : Math.min(hotel.cost, cap);
      const additional = cap != null && hotel.extra
        ? Math.min(Math.max(0, hotel.cost - cap), cap * (foreign ? 0.5 : 0.3)) : 0;
      const recognized = regular + additional;
      additionalLodging ||= additional > 0;
      const limit = cap == null ? "상한 없는 실비" : `기본 상한 ${inCurrency(cap, foreign)}`;
      const extra = additional ? ` · 추가 인정 ${inCurrency(additional, foreign)}` : "";
      return { recognized, detail: `${index + 1}박 · 증빙 ${inCurrency(hotel.cost, foreign)} · ${limit}${extra} · 인정 ${inCurrency(recognized, foreign)}` };
    });
    const lodging = convert(hotelRows.reduce((sum, hotel) => sum + hotel.recognized, 0));

    const fareBasis = foreign
      ? `제10조~제13조·제15조 · 항공운임 기본 기준 ${data.group === "2" ? "2등석" : "1등석"} 실비(별표 3)`
      : `별표 2·제15조 · 철도 ${data.group === "2" ? "일반실, 선박 2등급" : "특실, 선박 1등급"} 기준`;
    const dailyBasis = actual ? "별표에 따른 일비 실비 (입력값)"
      : `제16조 · ${inCurrency(dailyRate, foreign)} × ${days}일${reducedDays ? ` · 제17조 장기체재 감액 ${reducedDays}일` : ""}${data.half ? " · 50% 지급" : ""}`;
    const mealBasis = actual ? "별표에 따른 식비 실비 (입력값)"
      : `제16조 · ${inCurrency(mealRate, foreign)} × ${mealDays}일${extraMeals ? ` · 추가 지급 ${won(extraMeals)}` : ""}`;
    const rows = [
      { name: "운임", amount: data.fare, detail: fareBasis },
      { name: "일비", amount: daily, detail: dailyBasis },
      { name: "숙박비", amount: lodging, detail: hotelRows.length ? hotelRows.map((hotel) => hotel.detail) : "입력한 숙박 증빙 없음" },
      { name: "식비", amount: meals + extraMeals, detail: mealBasis }
    ];
    if (mileage) rows.push({ name: "공적 항공마일리지 추가 일비", amount: mileage, detail: `일비의 50%와 절감 운임 ${won(data.mileage)} 중 적은 금액` });
    if (foreign && data.preparation) rows.push({ name: "준비금", amount: data.preparation, detail: "제23조 · 지급 대상 항목의 증빙 실비" });
    const due = deadlines(data.end);
    const notes = [
      foreign ? `적용 환율 USD 1 = ${won(data.rate)}. 국외 숙박비 정산은 원칙적으로 ${due.standard}까지이며, 정해진 기준에 따라 연장할 수 있습니다.`
        : `운임·숙박비 일반 정산은 원칙적으로 ${due.standard}까지입니다.`
    ];
    if (additionalLodging || extraMeals) {
      notes.push(`제16조 추가 지급을 위한 증빙 제출 기한은 ${foreign ? due.standard : due.domesticExtra}입니다.`);
    }
    if (mileage) notes.push("마일리지 추가 일비는 기관의 세부 지급 기준을 확인하세요.");
    return { days, nights: hotelRows.length, rows, notes };
  }

  return { calculate, travelDays, won };
})();

if (typeof module !== "undefined") module.exports = TravelCalculator;
