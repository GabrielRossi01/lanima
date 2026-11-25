import { seedSubject, seedTopics } from "./helpers/accounts";
import { expect, test } from "./helpers/fixtures";

/**
 * Pictures of the four focus screens, to compare with design-reference/. CI publishes the folder as
 * an artifact (see ci.yml).
 */
const FOLDER = "focus-screenshots";
const PROJECTS = ["ipad-landscape", "ipad-portrait", "iphone", "galaxy-tab-landscape", "android-phone"];

test("screenshots dos temas do modo foco", async ({ page, account }, info) => {
  test.skip(!PROJECTS.includes(info.project.name), "só nos perfis comparados com os mockups");
  test.setTimeout(60_000);
  const subject = await seedSubject(account, { name: "Bioquímica", color: "rosa", icon: "flask-conical" });
  await seedTopics(account, subject.id, ["Enzimas"]);
  await page.goto(`/foco?materia=${subject.id}`);
  await expect(page.locator("[data-focus-theme][data-ready]")).toBeVisible();
  await page.getByRole("button", { name: "Bioquímica", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Enzimas" }).click();

  for (const [name, file] of [
    ["Silêncio", "silencio"],
    ["Chuva", "chuva"],
    ["Lo-fi", "lofi"],
    ["Deep Focus", "deep-focus"],
  ] as const) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator("[data-focus-backdrop]")).toHaveCount(1);
    await page.waitForTimeout(1200);
    const path = `${FOLDER}/${info.project.name}-${file}.png`;
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path, fullPage: true });
    await info.attach(`${info.project.name} · ${name}`, { path, contentType: "image/png" });
  }
});
