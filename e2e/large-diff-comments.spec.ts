import { test, expect, type Page } from "@playwright/test";
const path="docs/support/architecture.html";
const html='<html><body>\n<h1>Training</h1>\n<p id="first">Dashboard answers specific questions.</p>\n<p id="second">Second training passage.</p>\n</body></html>';
async function setup(page: Page, mode: "success" | "partial" | "review" = "success") {
  await page.addInitScript(()=>localStorage.setItem("mardoc_github_token","fake"));
  const posted: {id:number;body:string;user:{login:string};created_at:string}[]=[];
  const issueAttempts: string[]=[];
  const reviews: any[]=[];
  let fail=mode!=="success", sha="b".repeat(40);
  await page.route("https://api.github.com/**",async route=>{
    const url=new URL(route.request().url()), pathname=decodeURIComponent(url.pathname), method=route.request().method();
    const send=(data:unknown,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});
    const tooLarge=()=>send({message:`Diff entry ${path} diff is too large`},422);
    if (method==="POST" && pathname.endsWith("/pulls/12/reviews")) {
      const body=route.request().postDataJSON(); reviews.push(body);
      if (body.comments?.length) return tooLarge();
      if (mode==="review" && fail) {fail=false;return send({message:"Review rejected for test"},422);}
      return send({id:90});
    }
    if (method==="POST" && pathname.endsWith("/pulls/12/comments")) return tooLarge();
    if (method==="POST" && pathname.endsWith("/issues/12/comments")) {
      const body=route.request().postDataJSON().body; issueAttempts.push(body);
      if (mode==="partial" && posted.length===1 && fail) {fail=false;return send({message:"Comment rejected for test"},422);}
      const comment={id:posted.length+1,body,user:{login:"reviewer"},created_at:"2026-09-24T00:00:00Z"};
      posted.push(comment);return send(comment,201);
    }
    if (pathname.endsWith("/pulls/12/files")) return send([{filename:path,status:"modified"}]);
    if (pathname.endsWith("/pulls/12/comments")) return send([]);
    if (pathname.endsWith("/issues/12/comments")) return send(posted);
    if (pathname==="/graphql") return send({data:{repository:{pullRequest:{reviewThreads:{nodes:[]}}}}});
    if (pathname.includes("/contents/")) return send({encoding:"base64",content:Buffer.from(html).toString("base64")});
    return send({number:12,title:"Large training deck",state:"open",user:{login:"author"},
      base:{ref:"main",sha:"a".repeat(40),repo:{full_name:"acme/docs"}},
      head:{ref:"topic",sha,repo:{full_name:"acme/docs"}}});
  });
  await page.goto("/#/acme/docs/pull/12");
  await expect(page.frameLocator("iframe").locator("#first")).toBeVisible();
  await page.keyboard.press("Escape");
  return {posted,issueAttempts,reviews,advanceRevision:()=>{sha="c".repeat(40);}};
}
async function addComment(page: Page, selector: string, body: string) {
  await page.keyboard.press("Escape");
  await page.frameLocator("iframe").locator(selector).evaluate(element=>{
    const selection=window.getSelection()!, range=document.createRange();
    range.selectNodeContents(element); selection.removeAllRanges(); selection.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup",{bubbles:true}));
  });
  await expect(page.getByPlaceholder("Write your comment...")).toBeVisible();
  await page.frameLocator("iframe").locator("body").evaluate(()=>window.getSelection()!.removeAllRanges());
  await page.getByPlaceholder("Write your comment...").fill(body);
  await page.getByRole("button",{name:"Comment",exact:true}).last().click();
  await expect(page.getByText(body,{exact:false}).first()).toBeVisible();
  await page.keyboard.press("Escape");
}

test("oversized HTML comments post with context and can jump after reload",async({page})=>{
  const state=await setup(page);
  await addComment(page,"#first","Explain these dashboards");
  await page.getByRole("button",{name:"Finish Review (1)",exact:true}).click();
  await page.getByPlaceholder("Leave a comment (optional)").fill("Training review summary");
  await page.getByRole("button",{name:"Submit review",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:"posted to the PR conversation"})).toBeVisible();
  expect(state.posted).toHaveLength(1);
  expect(state.posted[0].body).toContain(`**${path}** (L3)`);
  expect(state.posted[0].body).toContain("Dashboard answers specific questions.");
  expect(state.reviews.at(-1)).toMatchObject({event:"COMMENT",body:"Training review summary"});
  await page.reload();
  await expect(page.getByRole("button",{name:"1 comment",exact:true})).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"All PR comments (1)",exact:true}).click();
  await page.getByRole("button",{name:`Open comment in ${path}`,exact:true}).click();
  await expect(page.frameLocator("iframe").locator("#first")).toBeFocused();
  state.advanceRevision();
  await page.reload();
  await expect(page.getByRole("button",{name:"1 comment",exact:true})).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"All PR comments (1)",exact:true}).click();
  await expect(page.getByRole("region",{name:"PR comment navigator"}).getByText("Outdated",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:`Open comment in ${path}`,exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:"older revision"})).toBeVisible();
});

test("a failed fallback keeps only unsent drafts and Retry does not duplicate confirmed comments",async({page})=>{
  const state=await setup(page,"partial");
  await addComment(page,"#first","First feedback");
  await addComment(page,"#second","Second feedback");
  await page.getByRole("button",{name:"Finish Review (2)",exact:true}).click();
  await page.getByRole("button",{name:"Submit review",exact:true}).click();
  await expect(page.getByText(/Unsent comments remain pending/)).toBeVisible();
  await expect(page.getByRole("button",{name:"Finish Review (1)",exact:true})).toBeVisible();
  expect(state.posted).toHaveLength(1);
  await page.getByRole("button",{name:"Submit review",exact:true}).click();
  await expect(page.getByText("Finish your review",{exact:true})).toHaveCount(0);
  expect(state.posted).toHaveLength(2);
  expect(state.issueAttempts.filter(body=>body.includes("First feedback"))).toHaveLength(1);
  expect(state.issueAttempts.filter(body=>body.includes("Second feedback"))).toHaveLength(2);
  expect(state.reviews[1].comments).toHaveLength(1);
});

test("retrying a failed final approval does not repost successful fallback comments",async({page})=>{
  const state=await setup(page,"review");
  await addComment(page,"#first","Approval feedback");
  await page.getByRole("button",{name:"Approve",exact:true}).click();
  await page.getByRole("button",{name:"Submit review",exact:true}).click();
  await expect(page.getByText(/review itself was not confirmed/)).toBeVisible();
  expect(state.posted).toHaveLength(1);
  await page.getByRole("button",{name:"Submit review",exact:true}).click();
  await expect(page.getByText("Approved",{exact:true})).toBeVisible();
  expect(state.issueAttempts).toHaveLength(1);
  expect(state.reviews.at(-1)).toMatchObject({event:"APPROVE"});
  expect(state.reviews.at(-1).comments).toBeUndefined();
});
