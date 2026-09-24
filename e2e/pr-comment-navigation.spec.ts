import { test, expect, type Page } from "@playwright/test";

async function setup(page: Page, slow = false, fail = false) {
  await page.addInitScript(() => localStorage.setItem("mardoc_github_token", "fake"));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const files = ["first.md", "renamed.md", "third.md", "removed.md", "deck.html"];
  const comments = files.map((path, i) => ({id:i+1,path:i===1?"old.md":path,line:3,side:i===3?"LEFT":"RIGHT",
    body:`> _"Target ${i+1}."_\n\nFeedback ${i+1}`,user:{login:"reviewer"},created_at:"2026-09-24T00:00:00Z"}));
  comments.push({...comments[0],id:99,path:"unavailable.md",body:"Unavailable feedback"});
  const pr={number:12,title:"Cross-file comments",state:"open",user:{login:"reviewer"},
    base:{ref:"main",sha:"a".repeat(40),repo:{full_name:"acme/docs"}},
    head:{ref:"topic",sha:"b".repeat(40),repo:{full_name:"acme/docs"}}};
  await page.route("https://api.github.com/**", async route => {
    const url=new URL(route.request().url()), path=decodeURIComponent(url.pathname);
    if (path.endsWith("/contents/renamed.md")) {
      if (slow) await gate;
      if (fail) {fail=false; await route.fulfill({status:422,body:'{"message":"Load failed"}'}); return;}
    }
    const file=path.split("/contents/")[1];
    const index=file==="old.md"?1:files.indexOf(file);
    const data=path.endsWith("/pulls/12/files") ? files.map((filename,i)=>({filename,status:i===1?"renamed":i===3?"removed":"modified",previous_filename:i===1?"old.md":undefined}))
      : path.endsWith("/pulls/12/comments") ? comments
      : path.endsWith("/issues/12/comments") ? [{id:9,body:"General feedback",user:{login:"reviewer"}}]
      : path==="/graphql" ? {data:{repository:{pullRequest:{reviewThreads:{nodes:[{id:"thread-2",isResolved:true,comments:{nodes:[{databaseId:2}]}}]}}}}}
      : file ? {encoding:"base64",content:Buffer.from(file === "deck.html" ? '<html><body><button onclick="this.textContent=String(Number(this.textContent)+1)">0</button></body></html>' : `# Document ${index+1}\n\nTarget ${index+1}.`).toString("base64")}
      : pr;
    await route.fulfill({contentType:"application/json",body:JSON.stringify(data)});
  });
  await page.goto("/#/acme/docs/pull/12");
  await expect(page.getByRole("button",{name:/All PR comments/})).toBeVisible();
  await dismissInitialComments(page);
  return release;
}
async function dismissInitialComments(page: Page) {
  await expect(page.getByRole("button",{name:"1 comment",exact:true})).toBeVisible();
  if ((page.viewportSize()?.width || 1280) < 768) {
    const sheet = page.locator('[role="dialog"][aria-label="Comments"]');
    await expect(sheet).toHaveAttribute("aria-hidden",/true|false/);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveAttribute("aria-hidden","true");
  }
}
async function openComment(page: Page, path: string) {
  await page.getByRole("button",{name:/All PR comments/}).click();
  await page.getByRole("button",{name:`Open comment in ${path}`,exact:true}).click();
}

test("PR index includes general/unavailable comments and jumps to renamed, resolved, removed documents",async ({page})=>{
  const release=await setup(page,true);
  await page.getByRole("button",{name:/All PR comments/}).click();
  const navigator=page.getByRole("region",{name:"PR comment navigator"});
  await expect(navigator.getByText("General feedback",{exact:true})).toBeVisible();
  await expect(navigator.getByText("This file is unavailable",{exact:false})).toBeVisible();
  await expect(navigator.getByText("Resolved",{exact:true})).toBeVisible();
  await navigator.getByRole("button",{name:"Open comment in renamed.md"}).click();
  await expect(page.getByRole("status").filter({hasText:"Loading document"})).toBeVisible();
  release();
  await expect(page.locator('mark[data-comment-id="rc-2"]').first()).toBeFocused();
  await openComment(page,"renamed.md"); // same-file requests are repeatable
  await expect(page.locator('mark[data-comment-id="rc-2"]').first()).toBeFocused();
  await openComment(page,"removed.md");
  await expect(page.locator('mark[data-comment-id="rc-4"]').first()).toBeFocused();
  expect(await page.locator('mark[data-comment-id="rc-4"]').first().evaluate(el=>el.closest("[data-review-side]")?.getAttribute("data-review-side"))).toBe("LEFT");
  await page.reload();
  await dismissInitialComments(page);
  await openComment(page,"renamed.md");
  await expect(page.locator('mark[data-comment-id="rc-2"]').first()).toBeFocused();
});

test("a newer comment jump wins over an obsolete slow fetch",async ({page})=>{
  const release=await setup(page,true);
  await openComment(page,"renamed.md");
  await expect(page.getByRole("status").filter({hasText:"Loading document"})).toBeVisible();
  await openComment(page,"third.md");
  await expect(page.locator('mark[data-comment-id="rc-3"]').first()).toBeFocused();
  release();
  await expect(page).toHaveURL(/files\/2$/);
  await expect(page.locator('mark[data-comment-id="rc-2"]')).toHaveCount(0);
});

test("a failed document can retry its queued comment jump",async ({page})=>{
  await setup(page,false,true);
  await openComment(page,"renamed.md");
  await page.getByRole("button",{name:"Retry document"}).click();
  await expect(page.locator('mark[data-comment-id="rc-2"]').first()).toBeFocused();
});

test("browser Back cancels a queued jump",async ({page})=>{
  const release=await setup(page,true);
  await expect(page.getByRole("button",{name:"1 comment",exact:true})).toBeVisible();
  await openComment(page,"renamed.md");
  await expect(page.getByRole("status").filter({hasText:"Loading document"})).toBeVisible();
  await page.goBack();
  release();
  await expect(page).toHaveURL(/pull\/12$/);
  await expect(page.getByRole("button",{name:"1 comment",exact:true})).toBeVisible();
  await expect(page.locator('mark[data-comment-id="rc-2"]')).toHaveCount(0);
});


test("opening comments preserves a live deck and reports an absent HTML target",async ({page})=>{
  await setup(page);
  await openComment(page,"deck.html");
  await expect(page.getByRole("status").filter({hasText:"The commented text could not be located"})).toBeVisible();
  const deck = page.frameLocator('iframe[title="deck.html"]');
  await deck.getByRole("button",{name:"0",exact:true}).click();
  await openComment(page,"third.md");
  await expect(page.locator('mark[data-comment-id="rc-3"]').first()).toBeFocused();
  await page.getByRole("button",{name:/Back to review/}).click();
  await expect(deck.getByRole("button",{name:"1",exact:true})).toBeVisible();
});
