import { describe, expect, it } from "vitest";
import { crc32, zip } from "../zip";

describe("zip do backup", () => {
  it("CRC-32 bate com o valor de referência", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("monta assinaturas, contagem e diretório central", () => {
    const out = zip([{ name: "a.txt", data: "olá" }, { name: "pasta/ção.bin", data: new Uint8Array([1, 2, 3]) }]);
    const v = new DataView(out.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const end = out.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(2);
    const centralStart = v.getUint32(end + 16, true);
    expect(v.getUint32(centralStart, true)).toBe(0x02014b50);
  });
});
