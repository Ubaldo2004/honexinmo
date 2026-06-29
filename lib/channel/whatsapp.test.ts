import { describe, it, expect } from "vitest";
import { waNumero, parseEvolutionInbound } from "./whatsapp";

describe("waNumero", () => {
  it("saca el sufijo @s.whatsapp.net", () => {
    expect(waNumero("5491122334455@s.whatsapp.net")).toBe("5491122334455");
  });
  it("saca el + y los separadores", () => {
    expect(waNumero("+54 911 2233-4455")).toBe("5491122334455");
  });
});

describe("parseEvolutionInbound", () => {
  const jid = "5491122334455@s.whatsapp.net";

  it("parsea un mensaje de texto entrante", () => {
    const body = { event: "messages.upsert", data: { key: { remoteJid: jid, fromMe: false }, message: { conversation: "Hola" }, pushName: "Juan" } };
    expect(parseEvolutionInbound(body)).toEqual({ from: "5491122334455", text: "Hola", nombre: "Juan" });
  });
  it("toma el extendedTextMessage", () => {
    const body = { data: { key: { remoteJid: jid, fromMe: false }, message: { extendedTextMessage: { text: "che" } } } };
    expect(parseEvolutionInbound(body)?.text).toBe("che");
  });
  it("ignora lo que mandamos nosotros (fromMe)", () => {
    const body = { data: { key: { remoteJid: jid, fromMe: true }, message: { conversation: "x" } } };
    expect(parseEvolutionInbound(body)).toBeNull();
  });
  it("ignora grupos (@g.us)", () => {
    const body = { data: { key: { remoteJid: "12345@g.us", fromMe: false }, message: { conversation: "x" } } };
    expect(parseEvolutionInbound(body)).toBeNull();
  });
  it("ignora si no hay texto", () => {
    const body = { data: { key: { remoteJid: jid, fromMe: false }, message: {} } };
    expect(parseEvolutionInbound(body)).toBeNull();
  });
  it("ignora eventos que no son messages.upsert", () => {
    const body = { event: "messages.update", data: { key: { remoteJid: jid, fromMe: false }, message: { conversation: "x" } } };
    expect(parseEvolutionInbound(body)).toBeNull();
  });
});
