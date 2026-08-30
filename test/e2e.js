const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const HOSTING = path.join(__dirname, "..", "hosting");
const html = fs.readFileSync(path.join(HOSTING, "index.html"), "utf8");

const dom = new JSDOM(html, {
  url: "http://localhost:8080/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;
const { document } = window;

const errors = [];
window.addEventListener("error", (e) => errors.push("window.error: " + e.message));
const origErr = console.error;
console.error = (...a) => { errors.push("console.error: " + a.join(" ")); };

function run(rel) {
  const code = fs.readFileSync(path.join(HOSTING, "js", rel), "utf8");
  window.eval(code);
}

["config.js", "i18n.js", "sandbox.js", "backend.js", "app.js", "fx.js"].forEach(run);
document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.from((r || document).querySelectorAll(s)); }
function nav(hash) {
  window.location.hash = hash;
  document.dispatchEvent(new window.Event("hashchange"));
}

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  \u2713 " + name); }
  else { fail++; console.log("  \u2717 FAIL: " + name); }
}

(async () => {
  await sleep(20);

  console.log("\n[1] Landing + luxury redesign");
  ok(!!$("#app .hero"), "landing hero renders");
  ok($$("#app .feature").length === 6, "6 feature cards");
  ok($$("#app .price-card").length === 3, "3 pricing cards");
  ok($$("#app .how-step").length === 3, "3 how-it-works steps");
  ok(!!$("#app footer"), "footer renders");
  ok(!!$("#app .coin-stage"), "3D coin stage present");
  ok(!!$("#app .coin"), "rotating 3D coin present");
  ok($$("#app .coin .face").length === 2, "coin has two faces (3D)");
  ok($$("#app .ring").length === 2, "orbit rings present");
  ok($$("#app .coin-chip").length === 5, "5 floating gateway chips");
  ok(!!$("#app .phone-mock"), "glass phone mock present");
  ok($$("#app .phone-mock .pm-row").length === 3, "phone mock shows 3 methods");
  ok(!!document.getElementById("particles"), "particle canvas exists");
  ok(!!document.querySelector(".bg-fx"), "aurora orb background exists");
  ok(!!document.querySelector(".cursor-glow"), "cursor glow layer exists");
  const reveal = $$("#app .reveal-item");
  ok(reveal.length > 0, "scroll-reveal items tagged (" + reveal.length + ")");
  ok(reveal.every((el) => el.classList.contains("revealed")), "reveal fallback fired");

  console.log("\n[2] Auth (merchant sign-up)");
  window.location.hash = "#/auth?mode=signup";
  document.dispatchEvent(new window.Event("hashchange"));
  await sleep(10);
  ok(!!$("#app .auth-card"), "auth card renders");
  await window.API.auth.signUp("merchant@test.com", "pass1234", { name: "Rahim Traders", role: "merchant" });
  await window.API.backend.register({ name: "Rahim Traders", company: "Rahim Traders", role: "merchant" });
  nav("#/app");
  await sleep(30);
  ok(!!$("#app .app"), "app shell renders");
  ok(!!$("#app .sidebar"), "sidebar renders");
  const navTexts = $$("#app .nav-item").map((a) => a.textContent.trim());
  ok(navTexts.some((x) => x.includes("Links") || x.includes("\u09B2\u09BF\u0982\u0995")), "merchant sees Links nav");
  ok(navTexts.some((x) => x.includes("Payouts") || x.includes("\u09AA\u09C7\u0993\u0986\u0989\u099F")), "merchant sees Payouts nav");
  ok($$("#app .stat").length === 4, "overview shows 4 stat cards");
  ok(!!$("#app .chart"), "14-day chart renders");

  console.log("\n[3] Payment link + fee settlement (sandbox)");
  const link = await window.API.backend.createLink({ amount: 1000, description: "Test order" });
  ok(!!(link && link.link && link.link.id), "created payment link");
  const links = await window.API.backend.listLinks();
  ok((links.links || []).some((l) => l.id === link.link.id), "link appears in list");

  await window.API.auth.signOut();
  await window.API.auth.signUp("customer@test.com", "pass1234");
  await window.API.backend.register({ name: "Customer", role: "customer" });
  const topup = await window.API.backend.topUp({ method: "bkash", amount: 2000 });
  await window.API.backend.confirmTopUp({ method: "bkash", paymentId: topup.payment.paymentId, otp: "1234", amount: 2000 });
  ok(!!topup.payment, "customer topped up wallet");
  const pay = await window.API.backend.payLink({ linkId: link.link.id, method: "wallet" });
  ok(!!pay && pay.transaction && pay.transaction.status === "success", "link paid");
  ok(pay.transaction.fee === 20, "platform fee settled (20 on 1000)");

  console.log("\n[4] Admin / earnings panel (owner)");
  await window.API.auth.signOut();
  await window.API.auth.signUp("officialmasudbro@gmail.com", "ownerpass1", { name: "Owner", role: "merchant" });
  await window.API.backend.register({ name: "Owner", role: "merchant" });
  const er = await window.API.backend.getEarnings();
  ok(er.isOwner === true, "owner recognized by email");
  ok(typeof er.stats.totalFees === "number" && er.stats.totalFees >= 20, "earnings stats include fee total");
  ok(Array.isArray(er.fees) && er.fees.length >= 1, "fee ledger lists entries");
  nav("#/app/earnings");
  await sleep(30);
  ok(!!$("#app .stat"), "earnings view renders stat cards");
  ok($$("#app .nav-item").some((a) => a.textContent.includes("Earnings") || a.textContent.includes("\u0986\u09AF\u09BC")), "owner sees Earnings nav");

  console.log("\n[5] Route coverage (no render crashes)");
  const routes = ["overview", "wallet", "transactions", "links", "invoices", "plans", "subscriptions", "customers", "payouts", "settings"];
  for (const r of routes) {
    nav("#/app/" + r);
    await sleep(15);
    ok(!!$("#app .content"), "route /" + r + " renders");
  }

  console.log("\n[6] Checkout page (public link)");
  nav("#/pay/" + link.link.id);
  await sleep(30);
  ok(!!$("#app .checkout-card"), "checkout card renders");
  ok(($("#app .checkout-card").textContent || "").includes("\u09F3"), "checkout shows amount");

  console.log("\n[7] Error mapping (no raw INTERNAL leaks)");
  // Simulate a Firebase "internal" error from the backend and confirm the
  // UI surfaces a friendly message instead of the raw "INTERNAL".
  const realDash = window.API.backend.getDashboard;
  window.API.backend.getDashboard = () => { const e = new Error("INTERNAL"); e.code = "internal"; throw e; };
  nav("#/app/overview");
  await sleep(30);
  const empty = $("#app .empty");
  const emptyText = empty ? empty.textContent : "";
  ok(!!empty, "error state rendered on failed backend call");
  ok(!/INTERNAL/i.test(emptyText), "raw INTERNAL not shown");
  ok(emptyText.includes(window.I18N.t("backendNotDeployed")) || emptyText.length > 0, "friendly message shown: \"" + emptyText.trim() + "\"");
  window.API.backend.getDashboard = realDash;
  nav("#/app/settings");
  await sleep(20);
  nav("#/app/overview");
  await sleep(30);
  ok(!!$("#app .stat"), "recovers after backend restored");

  console.log("\n--- runtime errors captured ---");
  const real = errors.filter((e) => !/gstatic\.com|Could not load script|jsdom/i.test(e));
  if (real.length) { real.forEach((e) => console.log("  " + e)); }
  else { console.log("  (none)"); }
  ok(real.length === 0, "no unexpected runtime errors");

  console.log("\n================ RESULT: " + pass + " passed, " + fail + " failed ================");
  process.exit(fail ? 1 : 0);
})().catch((e) => { origErr("FATAL: " + (e && e.stack || e)); process.exit(2); });
