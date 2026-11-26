export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function calculateEstimate({
  systemWp,
  ghi,
  pricePerKwh,
  systemCost = 0,
  PR,
  performanceRatio,
  co2KgPerKwh,
  co2KgPerTreeYear,
  uncertainty = 0.1,
}) {
  const ratio = PR ?? performanceRatio;
  const values = [
    systemWp,
    pricePerKwh,
    ratio,
    co2KgPerKwh,
    co2KgPerTreeYear,
    uncertainty,
  ];
  if (
    !Array.isArray(ghi) ||
    ghi.length !== 12 ||
    values.some((value) => !Number.isFinite(Number(value)))
  )
    return null;
  const wp = Number(systemWp);
  if (
    wp <= 0 ||
    ghi.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)
  )
    return null;
  const kWp = wp / 1000;
  const dailyKwh = ghi.map((sun) => kWp * Number(sun) * Number(ratio));
  const monthlyKwh = dailyKwh.map(
    (daily, index) => daily * DAYS_IN_MONTH[index],
  );
  const yearlyKwh = monthlyKwh.reduce((sum, value) => sum + value, 0);
  const savingsYear = yearlyKwh * Number(pricePerKwh);
  const cost = Number(systemCost) || 0;
  const co2Kg = yearlyKwh * Number(co2KgPerKwh);
  return {
    kWp,
    dailyKwh,
    monthlyKwh,
    yearlyKwh,
    avgDailyKwh: yearlyKwh / 365,
    savingsYear,
    paybackYears: cost > 0 && savingsYear > 0 ? cost / savingsYear : null,
    co2Kg,
    trees: Math.round(co2Kg / Number(co2KgPerTreeYear)),
    rangeLow: yearlyKwh * (1 - Number(uncertainty)),
    rangeHigh: yearlyKwh * (1 + Number(uncertainty)),
  };
}
