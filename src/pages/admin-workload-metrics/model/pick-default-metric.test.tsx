import { describe, expect, test } from "vitest";

import { pickDefaultMetric } from "./pick-default-metric";

describe("pickDefaultMetric", () => {
  test("prefers a tx metric over an earlier-sorting rx metric", () => {
    expect(pickDefaultMetric(["network.rxBytes", "network.txBytes"])).toBe(
      "network.txBytes"
    );
  });

  test("matches tx case-insensitively and regardless of position", () => {
    expect(pickDefaultMetric(["cpu.usage", "network.TxBytes"])).toBe(
      "network.TxBytes"
    );
  });

  test("falls back to the first metric when none mention tx", () => {
    expect(pickDefaultMetric(["cpu.usage", "memory.usage"])).toBe("cpu.usage");
  });

  test("returns null for an empty list", () => {
    expect(pickDefaultMetric([])).toBeNull();
  });
});
