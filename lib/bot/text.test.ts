import { describe, it, expect } from "vitest";
import { sinEmojis, parseDispo, sinAcento } from "./text";

describe("sinEmojis", () => {
  it("saca los emojis", () => {
    expect(sinEmojis("Hola 👋 cómo andás 🙂")).toBe("Hola cómo andás");
  });
  it("no toca texto sin emojis", () => {
    expect(sinEmojis("Casa en Funes, 3 dorm")).toBe("Casa en Funes, 3 dorm");
  });
  it("colapsa el espacio que deja el emoji", () => {
    expect(sinEmojis("a 🔥 b")).toBe("a b");
  });
});

describe("sinAcento", () => {
  it("saca acentos", () => {
    expect(sinAcento("miércoles")).toBe("miercoles");
  });
});

describe("parseDispo", () => {
  it("parsea día + franja", () => {
    expect(parseDispo("martes tarde")).toEqual([{ dia: "martes", franja: "tarde" }]);
  });
  it("parsea varios separados por coma o 'y'", () => {
    expect(parseDispo("martes tarde, jueves mañana")).toEqual([
      { dia: "martes", franja: "tarde" },
      { dia: "jueves", franja: "mañana" },
    ]);
  });
  it("tolera acentos y mayúsculas", () => {
    expect(parseDispo("Miércoles a la Mañana")).toEqual([{ dia: "miércoles", franja: "mañana" }]);
  });
  it("ignora lo que no tiene día o franja", () => {
    expect(parseDispo("cuando puedas")).toEqual([]);
  });
  it("no duplica", () => {
    expect(parseDispo("martes tarde, martes tarde")).toEqual([{ dia: "martes", franja: "tarde" }]);
  });
});
