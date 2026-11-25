import { describe, expect, it } from "vitest";
import { authErrorPath, authPath, authProblemMessage, oauthCallbackUrl } from "@/lib/auth/pages";
import { enabledProviders, isSocialProvider, PROVIDER_PARAMS } from "@/lib/auth/providers";
import { DEFAULT_AFTER_SIGN_IN, safeNextPath } from "@/lib/auth/redirect";
import { cameFromSignUp, forgetSignUp, markSignUp } from "@/lib/auth/sign-up";

describe("provedores sociais", () => {
  it("mostra só os listados, sempre na mesma ordem", () => {
    expect(enabledProviders("notion, Google")).toEqual(["google", "notion"]);
    expect(enabledProviders("google")).toEqual(["google"]);
    for (const none of [undefined, "", "false", "apple,facebook"]) expect(enabledProviders(none)).toEqual([]);
    expect(isSocialProvider("apple")).toBe(false);
  });

  it("manda o parâmetro que o Notion exige", () => {
    expect(PROVIDER_PARAMS.notion).toEqual({ owner: "user" });
  });
});

describe("telas de entrar e criar conta", () => {
  it("leva junto a tela pedida, e só quando há uma", () => {
    expect(authPath("entrar")).toBe("/entrar");
    expect(authPath("criar-conta", "/perfil")).toBe("/criar-conta?proxima=%2Fperfil");
  });

  it("nenhuma das duas é destino depois de entrar", () => {
    expect(safeNextPath("/criar-conta")).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath("/entrar?x=1")).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it("o retorno do provedor lembra o destino e o provedor", () => {
    const url = new URL(oauthCallbackUrl("https://app.test", "/perfil", "notion"));
    expect(url.origin + url.pathname).toBe("https://app.test/callback");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      proxima: "/perfil",
      provedor: "notion",
    });
  });

  it("vindo de Criar conta, o cadastro continua no passo 2, e só uma vez", () => {
    expect(cameFromSignUp()).toBe(false);
    markSignUp();
    expect(cameFromSignUp()).toBe(true);
    forgetSignUp();
    expect(cameFromSignUp()).toBe(false);
  });
});

describe("quando a entrada falha", () => {
  const back = (query: string) => authErrorPath(new URLSearchParams(query));

  it("volta para Entrar, com o motivo", () => {
    expect(back("provedor=google&proxima=/perfil&error=access_denied")).toBe(
      "/entrar?erro=cancelado&provedor=google&proxima=%2Fperfil",
    );
    expect(back("provedor=notion&error=server_error")).toBe("/entrar?erro=social&provedor=notion");
    expect(
      back("provedor=notion&error=server_error&error_description=Error+getting+user+email+from+external+provider"),
    ).toBe("/entrar?erro=sem-email&provedor=notion");
    // A code that can't be exchanged (another browser, expired).
    expect(back("provedor=google&code=x")).toBe("/entrar?erro=social&provedor=google");
  });

  it("link do e-mail e parâmetros desconhecidos", () => {
    expect(back("token_hash=x&type=email")).toBe("/entrar?erro=link");
    expect(back("provedor=google&proxima=//evil.com&error=access_denied")).toBe(
      "/entrar?erro=cancelado&provedor=google",
    );
    expect(back("provedor=apple&error=access_denied")).toBe("/entrar?erro=link");
  });

  it("mensagens", () => {
    expect(authProblemMessage("cancelado", "google")).toBe("A entrada com o Google foi cancelada.");
    expect(authProblemMessage("sem-email", "notion")).toContain("O Notion não informou seu e-mail");
    expect(authProblemMessage("social", "notion")).toContain("Não foi possível entrar com o Notion");
    expect(authProblemMessage("link", null)).toContain("Esse link expirou");
    for (const [problem, provider] of [
      [null, null],
      ["social", null],
      ["social", "<b>x</b>"],
      ["inventado", "google"],
    ] as const) {
      expect(authProblemMessage(problem, provider)).toBeUndefined();
    }
  });
});
