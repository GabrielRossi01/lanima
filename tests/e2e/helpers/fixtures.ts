import { test as base } from "@playwright/test";
import { createAccount, signIn, type TestAccount } from "./accounts";

/**
 * `account`: a fresh, onboarded user per test, already signed in on `page`. Each test gets its
 * own user, so tests that change the profile (theme, name) never affect each other.
 */
export const test = base.extend<{ account: TestAccount }>({
  account: async ({ page }, provide) => {
    const account = await createAccount();
    await signIn(page, account);
    await provide(account);
  },
});

export { expect } from "@playwright/test";
