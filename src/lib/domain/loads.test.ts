import { describe, expect, it } from "vitest";
import {
  adaptFromLast,
  barOrMachine,
  convertLoad,
  formatLoad,
  fromKg,
  parseWeight,
  suggestLoad,
  toKg,
  type LoadSource,
} from "./loads";

const bench: LoadSource = { name: "Développé couché barre", equipment: "barre", loadKg: 30, dumbbellKg: 12 };

describe("conversion kg / lb", () => {
  it("convertit les livres en kilos, au centième", () => {
    expect(toKg(50, "lb")).toBe(22.68);
    expect(toKg(27.5, "kg")).toBe(27.5);
  });

  it("revient au nombre saisi malgré l'arrondi du stockage", () => {
    expect(fromKg(toKg(50, "lb"), "lb")).toBe(50);
    expect(fromKg(toKg(135, "lb"), "lb")).toBe(135);
    expect(fromKg(toKg(22.5, "lb"), "lb")).toBe(22.5);
  });

  it("lit la virgule comme le point, et refuse l'illisible", () => {
    expect(parseWeight("27,5")).toBe(27.5);
    expect(parseWeight(" 40 ")).toBe(40);
    expect(parseWeight("")).toBeNull();
    expect(parseWeight("abc")).toBeNull();
    expect(parseWeight("-5")).toBeNull();
  });
});

describe("barre ou machine", () => {
  it("suit le matériel de l'exercice", () => {
    expect(barOrMachine("Squat barre", "barre")).toBe("barre");
    expect(barOrMachine("Tirage horizontal poulie", "poulie")).toBe("machine");
    expect(barOrMachine("Presse à cuisses", "machine")).toBe("machine");
  });

  it("se rabat sur le nom quand le matériel est inconnu", () => {
    expect(barOrMachine("Hip thrust", "autre")).toBe("barre");
    expect(barOrMachine("Leg extension", null)).toBe("machine");
    expect(barOrMachine("Mollets assis", "autre")).toBe("machine");
  });

  it("laisse le premier mot trancher quand il nomme la barre", () => {
    expect(barOrMachine("Barre au front ou kickback poulie", "poulie")).toBe("barre");
  });
});

describe("charge proposée", () => {
  it("prend celle du programme quand il n'y a pas d'habitude", () => {
    expect(suggestLoad(bench)).toEqual({ loadUnit: "barre", weight: "30", weightUnit: "kg" });
  });

  it("préfère la charge habituelle à celle du programme", () => {
    const s = suggestLoad({ ...bench, habitual: { loadUnit: "barre", weightKg: 45, weightUnit: "kg" } });
    expect(s).toEqual({ loadUnit: "barre", weight: "45", weightUnit: "kg" });
  });

  it("réaffiche une habitude saisie en livres dans son unité", () => {
    const s = suggestLoad({ ...bench, habitual: { loadUnit: "machine", weightKg: toKg(100, "lb"), weightUnit: "lb" } });
    expect(s).toEqual({ loadUnit: "machine", weight: "100", weightUnit: "lb" });
  });

  it("passe aux haltères avec la charge par haltère du programme, pas le nombre de la barre", () => {
    expect(suggestLoad(bench, "kg_par_haltere")).toEqual({ loadUnit: "kg_par_haltere", weight: "12", weightUnit: "kg" });
  });

  it("reprend l'habitude quand on revient à son type", () => {
    const source = { ...bench, habitual: { loadUnit: "kg_par_haltere" as const, weightKg: 16, weightUnit: "kg" as const } };
    expect(suggestLoad(source, "kg_par_haltere").weight).toBe("16");
    expect(suggestLoad(source, "barre").weight).toBe("30");
  });

  it("laisse le champ vide au poids du corps, et estime les autres types", () => {
    expect(suggestLoad(bench, "poids_du_corps").weight).toBe("");
    const lateral: LoadSource = { name: "Élévations latérales", equipment: "haltere", loadKg: null, dumbbellKg: 5 };
    expect(suggestLoad(lateral)).toEqual({ loadUnit: "kg_par_haltere", weight: "5", weightUnit: "kg" });
    // 5 kg par haltère : une machine équivalente se règle autour de 12,5 kg.
    expect(suggestLoad(lateral, "machine")).toEqual({
      loadUnit: "machine",
      weight: "12.5",
      weightUnit: "kg",
      estimated: true,
    });
  });

  it("sans charge au programme, choisit le type d'après l'exercice et laisse le champ vide", () => {
    const none = { loadKg: null, dumbbellKg: null };
    expect(suggestLoad({ ...none, name: "Développé couché barre", equipment: "barre" })).toEqual({
      loadUnit: "barre",
      weight: "",
      weightUnit: "kg",
    });
    expect(suggestLoad({ ...none, name: "Développé incliné haltères", equipment: "haltere" }).loadUnit).toBe(
      "kg_par_haltere",
    );
    expect(suggestLoad({ ...none, name: "Tirage horizontal poulie", equipment: "poulie" }).loadUnit).toBe("machine");
    expect(suggestLoad({ ...none, name: "Hip thrust", equipment: "autre" }).loadUnit).toBe("barre");
    expect(suggestLoad({ ...none, name: "Traction (ou négative si max < 3)", equipment: "poids_du_corps" }).loadUnit).toBe(
      "poids_du_corps",
    );
    expect(suggestLoad({ ...none, name: "Marche rapide ou vélo — 20 min en continu", equipment: "autre" }).loadUnit).toBe(
      "poids_du_corps",
    );
  });

  it("propose une charge pour chaque type, convertie quand le programme n'en donne pas", () => {
    // Le programme ne chiffre que la barre : les haltères et la machine sont estimés.
    const barre: LoadSource = { name: "Développé couché barre", equipment: "barre", loadKg: 40, dumbbellKg: null };
    expect(suggestLoad(barre, "kg_par_haltere")).toEqual({
      loadUnit: "kg_par_haltere",
      weight: "16",
      weightUnit: "kg",
      estimated: true,
    });
    expect(suggestLoad(barre, "machine").weight).toBe("40");
    expect(suggestLoad(barre, "barre").estimated).toBeUndefined();

    // Et dans l'autre sens, depuis ce qui a été soulevé aux haltères.
    const habituelle: LoadSource = {
      name: "Développé militaire haltères assis",
      equipment: "haltere",
      loadKg: null,
      dumbbellKg: null,
      habitual: { loadUnit: "kg_par_haltere", weightKg: 16, weightUnit: "kg" },
    };
    expect(suggestLoad(habituelle, "barre")).toEqual({
      loadUnit: "barre",
      weight: "40",
      weightUnit: "kg",
      estimated: true,
    });
    expect(suggestLoad(habituelle, "poids_du_corps").weight).toBe("");
  });

  it("arrondit l'estimation au pas des disques", () => {
    expect(convertLoad(27.5, "barre", "kg_par_haltere")).toBe(11);
    expect(convertLoad(10, "kg_par_haltere", "barre")).toBe(25);
    expect(convertLoad(30, "machine", "barre")).toBe(30);
    expect(convertLoad(30, "barre", "poids_du_corps")).toBeNull();
  });

  it("ignore une habitude à l'ancien type confondu barre/machine", () => {
    const s = suggestLoad({ ...bench, habitual: { loadUnit: "barre_machine", weightKg: 99, weightUnit: "kg" } });
    expect(s.weight).toBe("30");
  });
});

describe("libellé", () => {
  it("dit ce qui est soulevé, avec son unité", () => {
    expect(formatLoad(27.5, "barre", "kg")).toBe("27,5 kg");
    expect(formatLoad(50, "machine", "lb")).toBe("50 lb");
    expect(formatLoad(12, "kg_par_haltere", "kg")).toBe("12 kg / haltère");
    expect(formatLoad(null, "poids_du_corps", "kg")).toBe("PDC");
  });
});

describe("charge proposée d'après la dernière séance", () => {
  const range = { low: 8, high: 12 };
  const last = { date: "2026-09-14", loadUnit: "barre" as const, weightKg: 30, weightUnit: "kg" as const, sets: 3, reps: 12 };

  it("monte de 2,5 kg en haut du corps quand le haut de fourchette est tenu", () => {
    const a = adaptFromLast(last, range, "haut");
    expect(a.weightKg).toBe(32.5);
    expect(a.repsTarget).toBe(8);
    expect(a.reason).toBe("+2,5 kg : 3 × 12 tenus le 14/09, haut de fourchette");
  });

  it("monte de 5 kg en bas du corps", () => {
    expect(adaptFromLast(last, range, "bas").weightKg).toBe(35);
  });

  it("monte par pas de livres sur une machine en livres, et le réaffiche en livres", () => {
    const a = adaptFromLast({ ...last, loadUnit: "machine", weightKg: toKg(100, "lb"), weightUnit: "lb" }, range, "haut");
    expect(fromKg(a.weightKg!, "lb")).toBe(105);
    expect(a.weightUnit).toBe("lb");
    expect(suggestLoad({ name: "x", equipment: null, loadKg: null, dumbbellKg: null, habitual: a }).weight).toBe("105");
  });

  it("garde la charge et vise une répétition de plus sous le haut de fourchette", () => {
    const a = adaptFromLast({ ...last, reps: 10 }, range, "haut");
    expect(a.weightKg).toBe(30);
    expect(a.repsTarget).toBe(11);
    expect(a.reason).toBe("Même charge, vise 11 reps (3 × 10 le 14/09)");
  });

  it("reprend simplement la charge quand le programme ne donne pas de fourchette", () => {
    const a = adaptFromLast(last, null, "haut");
    expect(a.weightKg).toBe(30);
    expect(a.repsTarget).toBeNull();
  });
});
