// Parse the decimal representation before converting to integer storage units.
export function satang(input: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input);
  if (!match) throw Error("Invalid THB precision");
  const value =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647)
    throw Error("THB amount out of range");
  return value;
}

// Verify a single explicit addition without executing free-form expressions.
// Other monetary numbers (for example a separate deposit) stay with the model.
export function explicitSum(text: string): number | undefined {
  const number = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
  const expression = new RegExp(
    "(?<![\\d.,+-])(" +
      number +
      "(?:\\s*\\+\\s*" +
      number +
      ")+)(?![\\d.,+*-])",
    "g",
  );
  const matches = [...text.matchAll(expression)];
  if (matches.length !== 1 || /[\d%*]/.test(text.replace(expression, "")))
    return;
  const sum = matches[0][1]
    .split("+")
    .reduce(
      (total, part) => total + satang(part.trim().replaceAll(",", "")),
      0,
    );
  if (sum > 2147483647) throw Error("THB amount out of range");
  return sum;
}

// Reject an explicitly priced value the ledger cannot represent. This does not infer a total.
export function validateQuotedMoney(text: string) {
  const currency =
    /(?:\bTHB\s*|฿\s*)(-?\d+(?:,\d{3})*(?:\.\d+)?)|(-?\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:บาท|\bbaht\b|\bTHB\b)/gi;
  for (const match of text.matchAll(currency)) {
    satang((match[1] ?? match[2]).replaceAll(",", ""));
  }
}
