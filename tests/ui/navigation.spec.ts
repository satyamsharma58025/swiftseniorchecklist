import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";
import path from "node:path";

const baseURL = "http://127.0.0.1:3100";
const nextAuthSecret = "u1-playwright-test-secret";
const reviewSession = {
  sub: "u1-shell-review",
  name: "Shell Review",
  email: "shell-review@example.test",
  role: "MANAGER",
};
const mobileRoutes = [
  "/",
  "/dashboard",
  "/checklist/2000-01-01",
  "/queue/2000-01-01",
  "/tracker",
  "/escalations",
  "/employees/scorecard",
  "/admin/employees",
  "/admin/tasks",
  "/admin/templates",
  "/admin/holidays",
  "/admin/task-pauses",
  "/admin/reassignments",
  "/login",
];

async function addManagerSession(context: import("@playwright/test").BrowserContext) {
  const token = await encode({ token: reviewSession, secret: nextAuthSecret });
  await context.addCookies([{ name: "next-auth.session-token", value: token, url: baseURL }]);
}

test.beforeEach(async ({ context }) => {
  await addManagerSession(context);
});

test("marks the active primary destination for each operational route", async ({ page }) => {
  const routes = [
    ["/dashboard", "Dashboard"],
    ["/checklist/2000-01-01", "Checklist"],
    ["/queue/2000-01-01", "Queue"],
    ["/tracker", "Tracker"],
    ["/escalations", "Escalations"],
  ] as const;

  for (const [route, label] of routes) {
    await page.goto(route);
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
  }
});

test("opens Manage by keyboard and returns focus on Escape", async ({ page }) => {
  await page.goto("/dashboard");
  const manage = page.getByRole("button", { name: "Manage" });
  await manage.focus();
  await page.keyboard.press("Enter");

  await expect(manage).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: "Employees" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(manage).toHaveAttribute("aria-expanded", "false");
  await expect(manage).toBeFocused();
});

test("opens the mobile More sheet, traps focus, and returns focus on Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  const mobileNav = page.getByRole("navigation", { name: "Mobile primary navigation" });
  await expect(mobileNav).toBeVisible();
  const more = mobileNav.getByRole("button", { name: "More" });
  await more.click();

  const dialog = page.getByRole("dialog", { name: "More" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Employees" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(more).toBeFocused();
});

test("sign out is submitted with POST", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Shell Review/ }).click();
  const signOutRequest = page.waitForRequest((request) => request.url().includes("/api/auth/signout"));
  await page.getByRole("button", { name: "Sign out" }).click();
  expect((await signOutRequest).method()).toBe("POST");
});

test("captures the redesigned shell at mobile and desktop widths", async ({ page }) => {
  await page.goto("/dashboard");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation", { name: "Mobile primary navigation" })).toBeVisible();
  await page.screenshot({ path: path.join(process.cwd(), "docs/ui/shell/after-mobile.png"), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(process.cwd(), "docs/ui/shell/after-desktop.png"), fullPage: true });
});

test("has no horizontal page overflow at 360px across routes", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const route of mobileRoutes) {
    await page.goto(route);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(dimensions.document, `${route} document overflow`).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.body, `${route} body overflow`).toBeLessThanOrEqual(dimensions.viewport);
  }
});

test("signed-out navigation exposes one header Sign in action", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/login");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Sign in" })).toHaveCount(1);
});
