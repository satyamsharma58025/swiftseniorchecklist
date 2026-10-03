# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: navigation.spec.ts >> opens Manage by keyboard and returns focus on Escape
- Location: tests/ui/navigation.spec.ts:55:5

# Error details

```
Error: locator.focus: Target page, context or browser has been closed
Call log:
  - waiting for getByRole('button', { name: 'Manage' })

```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | import { encode } from "next-auth/jwt";
  3   | import path from "node:path";
  4   | 
  5   | const baseURL = "http://127.0.0.1:3100";
  6   | const nextAuthSecret = "u1-playwright-test-secret";
  7   | const reviewSession = {
  8   |   sub: "u1-shell-review",
  9   |   name: "Shell Review",
  10  |   email: "shell-review@example.test",
  11  |   role: "MANAGER",
  12  | };
  13  | const mobileRoutes = [
  14  |   "/",
  15  |   "/dashboard",
  16  |   "/checklist/2000-01-01",
  17  |   "/queue/2000-01-01",
  18  |   "/tracker",
  19  |   "/escalations",
  20  |   "/employees/scorecard",
  21  |   "/admin/employees",
  22  |   "/admin/tasks",
  23  |   "/admin/templates",
  24  |   "/admin/holidays",
  25  |   "/admin/task-pauses",
  26  |   "/admin/reassignments",
  27  |   "/login",
  28  | ];
  29  | 
  30  | async function addManagerSession(context: import("@playwright/test").BrowserContext) {
  31  |   const token = await encode({ token: reviewSession, secret: nextAuthSecret });
  32  |   await context.addCookies([{ name: "next-auth.session-token", value: token, url: baseURL }]);
  33  | }
  34  | 
  35  | test.beforeEach(async ({ context }) => {
  36  |   await addManagerSession(context);
  37  | });
  38  | 
  39  | test("marks the active primary destination for each operational route", async ({ page }) => {
  40  |   const routes = [
  41  |     ["/dashboard", "Dashboard"],
  42  |     ["/checklist/2000-01-01", "Checklist"],
  43  |     ["/queue/2000-01-01", "Queue"],
  44  |     ["/tracker", "Tracker"],
  45  |     ["/escalations", "Escalations"],
  46  |   ] as const;
  47  | 
  48  |   for (const [route, label] of routes) {
  49  |     await page.goto(route);
  50  |     const nav = page.getByRole("navigation", { name: "Primary navigation" });
  51  |     await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
  52  |   }
  53  | });
  54  | 
  55  | test("opens Manage by keyboard and returns focus on Escape", async ({ page }) => {
  56  |   await page.goto("/dashboard");
  57  |   const manage = page.getByRole("button", { name: "Manage" });
> 58  |   await manage.focus();
      |                ^ Error: locator.focus: Target page, context or browser has been closed
  59  |   await page.keyboard.press("Enter");
  60  | 
  61  |   await expect(manage).toHaveAttribute("aria-expanded", "true");
  62  |   await expect(page.getByRole("link", { name: "Employees" })).toBeFocused();
  63  |   await page.keyboard.press("Escape");
  64  |   await expect(manage).toHaveAttribute("aria-expanded", "false");
  65  |   await expect(manage).toBeFocused();
  66  | });
  67  | 
  68  | test("opens the mobile More sheet, traps focus, and returns focus on Escape", async ({ page }) => {
  69  |   await page.setViewportSize({ width: 390, height: 844 });
  70  |   await page.goto("/dashboard");
  71  |   const mobileNav = page.getByRole("navigation", { name: "Mobile primary navigation" });
  72  |   await expect(mobileNav).toBeVisible();
  73  |   const more = mobileNav.getByRole("button", { name: "More" });
  74  |   await more.click();
  75  | 
  76  |   const dialog = page.getByRole("dialog", { name: "More" });
  77  |   await expect(dialog).toBeVisible();
  78  |   await expect(dialog.getByRole("link", { name: "Employees" })).toBeFocused();
  79  |   await page.keyboard.press("Escape");
  80  |   await expect(dialog).toBeHidden();
  81  |   await expect(more).toBeFocused();
  82  | });
  83  | 
  84  | test("sign out is submitted with POST", async ({ page }) => {
  85  |   await page.goto("/dashboard");
  86  |   await page.getByRole("button", { name: /Shell Review/ }).click();
  87  |   const signOutRequest = page.waitForRequest((request) => request.url().includes("/api/auth/signout"));
  88  |   await page.getByRole("button", { name: "Sign out" }).click();
  89  |   expect((await signOutRequest).method()).toBe("POST");
  90  | });
  91  | 
  92  | test("captures the redesigned shell at mobile and desktop widths", async ({ page }) => {
  93  |   await page.goto("/dashboard");
  94  |   await page.setViewportSize({ width: 390, height: 844 });
  95  |   await expect(page.getByRole("navigation", { name: "Mobile primary navigation" })).toBeVisible();
  96  |   await page.screenshot({ path: path.join(process.cwd(), "docs/ui/shell/after-mobile.png"), fullPage: true });
  97  | 
  98  |   await page.setViewportSize({ width: 1440, height: 1000 });
  99  |   await page.screenshot({ path: path.join(process.cwd(), "docs/ui/shell/after-desktop.png"), fullPage: true });
  100 | });
  101 | 
  102 | test("has no horizontal page overflow at 360px across routes", async ({ page }) => {
  103 |   await page.setViewportSize({ width: 360, height: 800 });
  104 |   for (const route of mobileRoutes) {
  105 |     await page.goto(route);
  106 |     const dimensions = await page.evaluate(() => ({
  107 |       viewport: document.documentElement.clientWidth,
  108 |       document: document.documentElement.scrollWidth,
  109 |       body: document.body.scrollWidth,
  110 |     }));
  111 |     expect(dimensions.document, `${route} document overflow`).toBeLessThanOrEqual(dimensions.viewport);
  112 |     expect(dimensions.body, `${route} body overflow`).toBeLessThanOrEqual(dimensions.viewport);
  113 |   }
  114 | });
  115 | 
  116 | test("signed-out navigation exposes one header Sign in action", async ({ page, context }) => {
  117 |   await context.clearCookies();
  118 |   await page.goto("/login");
  119 |   const header = page.getByRole("banner");
  120 |   await expect(header.getByRole("link", { name: "Sign in" })).toHaveCount(1);
  121 | });
  122 | 
```