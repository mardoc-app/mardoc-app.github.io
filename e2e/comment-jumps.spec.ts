import { test, expect, type Page } from "@playwright/test";
const head = "# Review\n\nSame **phrase**.\n\nNew text.\n\nSame **phrase**.\n\nDuplicate Duplicate\n\nRead **this** guide\n\nNext step";
const base = head.replace("New text.", "Old text.");
async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("mardoc_github_token","fake");
    (window as any).__commentScrolls = 0;
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function(options) {
      if (this.hasAttribute("data-comment-id") || this.hasAttribute("data-review-side")) (window as any).__commentScrolls++;
      original.call(this, options);
    };
  });
  const quote = (text:string, body:string) => '> _"'+text+'"_\n\n'+body;
  const comments = [
    {id:1,line:7,side:"RIGHT",body:quote("Same phrase.","Repeated target")},
    {id:2,line:5,side:"LEFT",body:quote("Old text.","Base target")},
    {id:3,line:null,original_line:7,side:"RIGHT",body:quote("Same phrase.","Old revision")},
    {id:4,line:9,side:"RIGHT",body:quote("Duplicate","Ambiguous target")},
    {id:5,line:13,start_line:11,start_side:"RIGHT",side:"RIGHT",body:quote("this guide\n\nNext step","Cross block")},
    {id:6,line:5,side:"RIGHT",body:"Range only"},
    {id:7,line:7,side:"RIGHT",body:quote("Missing text","Missing target")},
  ].map(comment => ({...comment,path:"guide.md",user:{login:"reviewer"},created_at:"2026-09-24T00:00:00Z",commit_id:"b".repeat(40)}));
  const pr = {number:12,title:"Comment navigation",state:"open",user:{login:"reviewer"},created_at:"2026-09-24T00:00:00Z",
    base:{ref:"main",sha:"a".repeat(40),repo:{full_name:"acme/docs"}},
    head:{ref:"topic",sha:"b".repeat(40),repo:{full_name:"acme/docs"}}};
  await page.route("https://api.github.com/**", async route => {
    const url=new URL(route.request().url());
    const path=decodeURIComponent(url.pathname);
    const data = path.endsWith("/pulls/12/files") ? [{filename:"guide.md",status:"modified"}]
      : path.endsWith("/pulls/12/comments") ? comments
      : path.endsWith("/issues/12/comments") ? []
      : path === "/graphql" ? {data:{repository:{pullRequest:{reviewThreads:{nodes:[]}}}}}
      : path.includes("/contents/") ? {encoding:"base64",content:Buffer.from(url.searchParams.get("ref")==="a".repeat(40)?base:head).toString("base64")}
      : pr;
    await route.fulfill({contentType:"application/json",body:JSON.stringify(data)});
  });
  await page.goto("/#/acme/docs/pull/12");
  await expect(page.getByRole("button",{name:"7 comments",exact:true})).toBeVisible();
}
async function jump(page:Page, body:string, mobile:boolean, keyboard=false) {
  const card=page.getByText(body,{exact:false}).locator("xpath=../..");
  const button=card.getByRole("button",{name:"Jump to comment",exact:true});
  if (mobile) {
    const open=await page.locator('[role="dialog"][aria-label="Comments"]').getAttribute("aria-hidden") === "false";
    if (!open) await page.getByRole("button",{name:"7 comments",exact:true}).click();
  }
  if (keyboard) { await button.focus(); await page.keyboard.press("Enter"); }
  else await button.click();
}

test("jumps use source side/range, refuse uncertainty, and preserve formatted selections", async ({page,isMobile}) => {
  await setup(page);
  await jump(page,"Repeated target",isMobile,true);
  const repeated=page.locator('mark[data-comment-id="rc-1"]');
  await expect(repeated.first()).toBeFocused();
  await expect(repeated.first()).toBeInViewport();
  await expect(page.locator('[data-review-side="RIGHT"][data-review-start="3"] mark')).toHaveCount(0);
  expect(await repeated.first().evaluate(el => el.closest("[data-review-side]")?.getAttribute("data-review-start"))).toBe("7");
  if (isMobile) await expect.poll(() => page.locator('[role="dialog"][aria-label="Comments"]').evaluate(el => el.getBoundingClientRect().top >= window.innerHeight-1)).toBe(true);

  const scrolls = await page.evaluate(() => (window as any).__commentScrolls);
  await page.getByRole("button",{name:"Inline Diff",exact:true}).click();
  await expect(page.getByText("base: guide.md",{exact:true})).toHaveCount(0);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => (window as any).__commentScrolls)).toBe(scrolls);

  await jump(page,"Base target",isMobile);
  await expect(page.locator('mark[data-comment-id="rc-2"]').first()).toBeFocused();
  expect(await page.locator('mark[data-comment-id="rc-2"]').first().evaluate(el=>el.closest("[data-review-side]")?.getAttribute("data-review-side"))).toBe("LEFT");

  await jump(page,"Old revision",isMobile);
  await expect(page.getByRole("status").filter({hasText:"older revision"})).toBeVisible();
  await expect(page.locator('mark[data-comment-id="rc-3"]')).toHaveCount(0);
  await jump(page,"Ambiguous target",isMobile);
  await expect(page.getByRole("status").filter({hasText:"More than one passage"})).toBeVisible();
  await expect(page.locator('mark[data-comment-id="rc-4"]')).toHaveCount(0);
  await jump(page,"Missing target",isMobile);
  await expect(page.getByRole("status").filter({hasText:"could not be located"})).toBeVisible();
  await jump(page,"Cross block",isMobile);
  await expect(page.locator('mark[data-comment-id="rc-5"]').first()).toBeFocused();
  await expect(page.locator('mark[data-comment-id="rc-5"]')).toHaveCount(3);
  await jump(page,"Range only",isMobile);
  await expect(page.getByRole("status").filter({hasText:"Source block highlighted"})).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button",{name:"7 comments",exact:true})).toBeVisible();
  await jump(page,"Repeated target",isMobile);
  await expect(page.locator('mark[data-comment-id="rc-1"]').first()).toBeFocused();
});
