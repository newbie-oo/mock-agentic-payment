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
