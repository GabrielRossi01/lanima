import { describe, expect, it, vi } from "vitest";
import { decideGate } from "@/lib/auth/gate";
import { cleanOtpInput, isValidOtp } from "@/lib/auth/otp";
import { DEFAULT_AFTER_SIGN_IN, safeNextPath } from "@/lib/auth/redirect";
import { avatarExtension, encodeAvatar, squareCropWithin } from "@/lib/images/avatar";
import {
  focusGoalSchema,
  formatFocusGoal,
  parseProfileDetails,
  profileSubtitle,
  semesterLabel,
  toProfile,
  type ProfileRow,
} from "@/lib/profile/profile";
import {
  colorForCustomSubject,
  normalizeSubjectName,
  subjectsToCreate,
  SUGGESTED_SUBJECTS,
} from "@/lib/subjects/suggestions";
import { DataError, errorTag, friendlyError } from "@/lib/supabase/errors";

describe("decideGate: login, onboarding ou app", () => {
  const done = { onboardingDone: true };
  const pending = { onboardingDone: false };

  it("espera enquanto lê a sessão no aparelho", () => {
    expect(decideGate("app", "loading", undefined)).toEqual({ kind: "wait" });
    expect(decideGate("sign-in", "loading", undefined)).toEqual({ kind: "wait" });
  });

  it("sem sessão, o app manda para /entrar guardando a tela pedida", () => {
    expect(decideGate("app", "signed-out", undefined, "/perfil")).toEqual({
      kind: "redirect",
      to: "/entrar?proxima=%2Fperfil",
    });
    expect(decideGate("app", "signed-out", undefined, "/inicio")).toEqual({ kind: "redirect", to: "/entrar" });
    expect(decideGate("onboarding", "signed-out", undefined)).toEqual({ kind: "redirect", to: "/entrar" });
  });

  it("perfil sem onboarding vai para /boas-vindas; com onboarding fica no app", () => {
    expect(decideGate("app", "signed-in", pending)).toEqual({ kind: "redirect", to: "/boas-vindas" });
    expect(decideGate("app", "signed-in", done)).toEqual({ kind: "render" });
    expect(decideGate("onboarding", "signed-in", pending)).toEqual({ kind: "render" });
    expect(decideGate("onboarding", "signed-in", done)).toEqual({ kind: "redirect", to: "/inicio" });
  });

  it("com sessão, a tela de entrar segue para o app", () => {
    expect(decideGate("sign-in", "signed-in", undefined)).toEqual({ kind: "redirect", to: "/inicio" });
    expect(decideGate("sign-in", "signed-out", undefined)).toEqual({ kind: "render" });
    expect(decideGate("sign-in", "signed-in", undefined, "/entrar", "/perfil")).toEqual({
      kind: "redirect",
      to: "/perfil",
    });
  });

  it("offline com sessão conhecida, o app abre mesmo sem perfil carregado", () => {
    expect(decideGate("app", "offline", undefined)).toEqual({ kind: "render" });
    expect(decideGate("app", "offline", null)).toEqual({ kind: "render" });
    expect(decideGate("app", "offline", pending)).toEqual({ kind: "redirect", to: "/boas-vindas" });
  });

  it("online, espera o perfil antes de decidir; se o perfil falhar, mostra a tela de erro", () => {
    expect(decideGate("app", "signed-in", undefined)).toEqual({ kind: "wait" });
    // Regression: a failing profile used to leave the splash on screen forever.
    expect(decideGate("app", "signed-in", null)).toEqual({ kind: "error" });
    expect(decideGate("onboarding", "signed-in", null)).toEqual({ kind: "error" });
    expect(decideGate("onboarding", "offline", null)).toEqual({ kind: "error" });
  });
});

describe("safeNextPath", () => {
  it("aceita caminhos do próprio app", () => {
    expect(safeNextPath("/perfil")).toBe("/perfil");
    expect(safeNextPath("/materias?filtro=prova")).toBe("/materias?filtro=prova");
  });

  it("recusa endereços externos e volta para o início", () => {
    for (const bad of [null, "", "https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "perfil"]) {
      expect(safeNextPath(bad), String(bad)).toBe(DEFAULT_AFTER_SIGN_IN);
    }
  });

  it("não volta para a tela de entrar nem para o callback", () => {
    expect(safeNextPath("/entrar")).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath("/callback?code=x")).toBe(DEFAULT_AFTER_SIGN_IN);
  });
});

describe("perfil", () => {
  it("formata a meta diária", () => {
    expect(formatFocusGoal(30)).toBe("30min");
    expect(formatFocusGoal(60)).toBe("1h");
    expect(formatFocusGoal(90)).toBe("1h 30min");
    expect(formatFocusGoal(120)).toBe("2h");
    expect(formatFocusGoal(360)).toBe("6h");
  });

  it("meta vai de 30 min a 6 h, de 15 em 15", () => {
    expect(focusGoalSchema.safeParse(30).success).toBe(true);
    expect(focusGoalSchema.safeParse(135).success).toBe(true);
    expect(focusGoalSchema.safeParse(20).success).toBe(false);
    expect(focusGoalSchema.safeParse(370).success).toBe(false);
    expect(focusGoalSchema.safeParse(100).success).toBe(false);
  });

  it("valida o formulário com mensagens em português", () => {
    const ok = parseProfileDetails({ name: "  Maria ", semester: "3", course: "Biomedicina", institution: "" });
    expect(ok).toEqual({ ok: true, data: { name: "Maria", semester: 3, course: "Biomedicina", institution: "" } });

    const bad = parseProfileDetails({ name: " ", semester: "", course: "", institution: "x".repeat(121) });
    expect(bad).toEqual({
      ok: false,
      errors: {
        name: "Conte como quer ser chamada.",
        semester: "Escolha o semestre.",
        course: "Informe o curso.",
        institution: "Use até 120 caracteres.",
      },
    });
  });

  it("rótulos de semestre e subtítulo do perfil", () => {
    expect(semesterLabel(3)).toBe("3º semestre");
    expect(profileSubtitle({ course: "Biomedicina", semester: 3 })).toBe("Biomedicina · 3º semestre");
    expect(profileSubtitle({ course: "", semester: null })).toBe("Biomedicina");
  });

  it("tema desconhecido no banco vira Automático", () => {
    const row = { theme: "sepia" } as ProfileRow;
    expect(toProfile(row).theme).toBe("system");
    expect(toProfile({ ...row, theme: "dark" }).theme).toBe("dark");
  });
});

describe("matérias do onboarding", () => {
  it("as 8 sugestões do mockup, cada uma com a cor do chip", () => {
    expect(SUGGESTED_SUBJECTS.map((s) => [s.name, s.color])).toEqual([
      ["Anatomia Humana", "celeste"],
      ["Bioquímica", "rosa"],
      ["Citologia e Histologia", "lilas"],
      ["Fisiologia", "amarelo"],
      ["Imunologia", "verde"],
      ["Microbiologia", "celeste"],
      ["Genética", "rosa"],
      ["Parasitologia", "amarelo"],
    ]);
  });

  it("não recria matérias que ela já tem e ignora repetidas", () => {
    const drafts = [
      { name: "Bioquímica", color: "rosa", icon: "flask-conical" },
      { name: "  farmacologia  ", color: "verde", icon: "book-open" },
      { name: "Farmacologia", color: "lilas", icon: "book-open" },
      { name: "   ", color: "amarelo", icon: "book-open" },
    ] as const;
    expect(subjectsToCreate(drafts, ["BIOQUÍMICA"])).toEqual([
      { name: "farmacologia", color: "verde", icon: "book-open" },
    ]);
  });

  it("normaliza espaços e gira as cores das matérias novas", () => {
    expect(normalizeSubjectName("  Saúde   Coletiva ")).toBe("Saúde Coletiva");
    expect([0, 1, 4, 5].map(colorForCustomSubject)).toEqual(["amarelo", "rosa", "lilas", "amarelo"]);
  });
});

describe("foto de perfil", () => {
  it("o recorte é sempre um quadrado dentro da imagem", () => {
    expect(squareCropWithin({ x: 10.4, y: 20.6, width: 300.2, height: 299.7 }, 1000, 800)).toEqual({
      x: 10,
      y: 21,
      width: 300,
      height: 300,
    });
    // Slightly outside after pinch-zoom: pulled back in.
    expect(squareCropWithin({ x: 900, y: -5, width: 200, height: 200 }, 1000, 800)).toEqual({
      x: 800,
      y: 0,
      width: 200,
      height: 200,
    });
    // Never larger than the image.
    expect(squareCropWithin({ x: 0, y: 0, width: 1200, height: 1200 }, 1000, 800).width).toBe(800);
  });

  function fakeCanvas(produces: (type: string) => string | null) {
    return {
      toBlob(callback: (blob: Blob | null) => void, type: string) {
        const out = produces(type);
        callback(out ? new Blob(["x"], { type: out }) : null);
      },
    } as unknown as HTMLCanvasElement;
  }

  it("usa WebP quando o navegador codifica, senão JPEG (o Safari pode devolver PNG)", async () => {
    const webp = await encodeAvatar(fakeCanvas((t) => t));
    expect(webp.type).toBe("image/webp");
    expect(avatarExtension(webp)).toBe("webp");

    const jpeg = await encodeAvatar(fakeCanvas((t) => (t === "image/webp" ? "image/png" : t)));
    expect(jpeg.type).toBe("image/jpeg");
    expect(avatarExtension(jpeg)).toBe("jpg");

    await expect(encodeAvatar(fakeCanvas(() => null))).rejects.toThrow("Não foi possível processar a foto");
  });
});

describe("mensagens de erro", () => {
  it("traduz pelos códigos do Supabase", () => {
    expect(friendlyError({ status: 429 })).toMatch(/Muitas tentativas/);
    expect(friendlyError({ code: "over_email_send_rate_limit", status: 429 })).toMatch(/Muitos e-mails/);
    expect(friendlyError({ code: "otp_expired", message: "Token has expired or is invalid" })).toMatch(
      /Código inválido/,
    );
    expect(friendlyError({ message: "Token has expired or is invalid", status: 403 })).toMatch(/Código inválido/);
    expect(friendlyError({ code: "email_address_not_authorized", status: 400 })).toMatch(/SMTP/);
    expect(friendlyError({ name: "AuthRetryableFetchError", message: "Failed to fetch" })).toMatch(/servidor/);
    expect(friendlyError(new TypeError("Load failed"))).toMatch(/servidor/);
  });

  it("erro de configuração nunca vira “código inválido”: mostra o código técnico", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // The real bug: a wrong publishable key answered "Invalid API key" and the app said "wrong code".
    const apiKey = friendlyError({ message: "Invalid API key", status: 401 }, "Não foi possível enviar o e-mail.");
    expect(apiKey).toBe("Não foi possível enviar o e-mail. (401)");
    expect(friendlyError({ message: "Invalid path specified in request URL", status: 404 })).not.toMatch(/Código/);
    expect(friendlyError({ message: "algo estranho" }, "Padrão")).toBe("Padrão (erro desconhecido)");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("etiqueta técnica da tela de erro", () => {
    expect(errorTag(new DataError("relation not found", { status: 404, code: "PGRST205" }))).toBe("404 · PGRST205");
    expect(errorTag({ code: "otp_expired" })).toBe("otp_expired");
    expect(errorTag(new TypeError("Failed to fetch"))).toBe("sem resposta do servidor");
    expect(errorTag(null)).toBe("erro desconhecido");
  });

  it("offline avisa que está sem conexão", () => {
    const spy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(friendlyError(new Error("x"))).toMatch(/Sem conexão/);
    spy.mockRestore();
  });
});

describe("código do e-mail", () => {
  it("aceita de 6 a 10 dígitos, como o Supabase permite configurar", () => {
    expect(isValidOtp("123456")).toBe(true);
    expect(isValidOtp("12345678")).toBe(true);
    expect(isValidOtp("1234567890")).toBe(true);
    expect(isValidOtp("12345")).toBe(false);
    expect(isValidOtp("12345678901")).toBe(false);
    expect(isValidOtp("12a456")).toBe(false);
  });

  it("limpa espaços e traços de um código colado", () => {
    expect(cleanOtpInput("1234 5678")).toBe("12345678");
    expect(cleanOtpInput(" 123-456 ")).toBe("123456");
    expect(cleanOtpInput("12345678901234")).toBe("1234567890");
  });
});

describe("erros de programação não viram erro de rede", () => {
  it("um TypeError qualquer aparece com a etiqueta técnica", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(friendlyError(new TypeError("x is undefined"))).toBe("Não deu certo. Tente de novo. (TypeError)");
    spy.mockRestore();
  });
});
