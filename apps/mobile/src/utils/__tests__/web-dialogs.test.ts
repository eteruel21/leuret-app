import { describe, expect, it } from "vitest";

import { dialogText, runWebDialog, type BrowserDialogs } from "../web-dialogs";

function fakeDialogs(confirmAnswers: boolean[] = []) {
  const shown: { kind: "alert" | "confirm"; text: string }[] = [];
  const answers = [...confirmAnswers];
  const dialogs: BrowserDialogs = {
    alert: (text) => {
      shown.push({ kind: "alert", text });
    },
    confirm: (text) => {
      shown.push({ kind: "confirm", text });
      return answers.shift() ?? false;
    },
  };
  return { dialogs, shown };
}

describe("dialogText", () => {
  it("une título y mensaje, y omite partes vacías", () => {
    expect(dialogText("Título", "Mensaje")).toBe("Título\n\nMensaje");
    expect(dialogText("Título")).toBe("Título");
    expect(dialogText("", "Mensaje")).toBe("Mensaje");
  });
});

describe("runWebDialog", () => {
  it("sin botones muestra un aviso", () => {
    const { dialogs, shown } = fakeDialogs();
    expect(runWebDialog("Error", "No se pudo guardar", undefined, dialogs)).toBeNull();
    expect(shown).toEqual([{ kind: "alert", text: "Error\n\nNo se pudo guardar" }]);
  });

  it("con un botón avisa y ejecuta su acción", () => {
    const { dialogs, shown } = fakeDialogs();
    let pressed = 0;
    runWebDialog("Listo", "Perfil guardado", [{ text: "Entendido", onPress: () => { pressed += 1; } }], dialogs);
    expect(shown[0].kind).toBe("alert");
    expect(pressed).toBe(1);
  });

  it("acción + cancelar: Aceptar ejecuta la acción", () => {
    const { dialogs, shown } = fakeDialogs([true]);
    const calls: string[] = [];
    const chosen = runWebDialog("Eliminar contacto", "¿Deseas eliminar a Ana?", [
      { text: "Cancelar", style: "cancel", onPress: () => { calls.push("cancel"); } },
      { text: "Eliminar", style: "destructive", onPress: () => { calls.push("delete"); } },
    ], dialogs);
    expect(chosen?.text).toBe("Eliminar");
    expect(calls).toEqual(["delete"]);
    expect(shown[0]).toEqual({
      kind: "confirm",
      text: "Eliminar contacto\n\n¿Deseas eliminar a Ana?\n\nAceptar: Eliminar",
    });
  });

  it("acción + cancelar: Cancelar no ejecuta la acción destructiva", () => {
    const { dialogs } = fakeDialogs([false]);
    const calls: string[] = [];
    runWebDialog("Cerrar sesión", "¿Deseas salir?", [
      { text: "Cancelar", style: "cancel", onPress: () => { calls.push("cancel"); } },
      { text: "Salir", style: "destructive", onPress: () => { calls.push("logout"); } },
    ], dialogs);
    expect(calls).toEqual(["cancel"]);
  });

  it("varias acciones: pregunta por cada una hasta que se acepte", () => {
    const { dialogs, shown } = fakeDialogs([false, true]);
    const calls: string[] = [];
    runWebDialog("Foto", "¿De dónde?", [
      { text: "Galería", onPress: () => { calls.push("library"); } },
      { text: "Cámara", onPress: () => { calls.push("camera"); } },
      { text: "Cancelar", style: "cancel" },
    ], dialogs);
    expect(shown.map((entry) => entry.text.split("\n").pop())).toEqual(["¿Galería?", "¿Cámara?"]);
    expect(calls).toEqual(["camera"]);
  });

  it("varias acciones rechazadas terminan en cancelar", () => {
    const { dialogs } = fakeDialogs([false, false]);
    const calls: string[] = [];
    const chosen = runWebDialog("Foto", undefined, [
      { text: "Galería", onPress: () => { calls.push("library"); } },
      { text: "Cámara", onPress: () => { calls.push("camera"); } },
      { text: "Ahora no", style: "cancel", onPress: () => { calls.push("cancel"); } },
    ], dialogs);
    expect(chosen?.text).toBe("Ahora no");
    expect(calls).toEqual(["cancel"]);
  });
});
