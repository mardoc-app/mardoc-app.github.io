import { test, expect, type Page } from "@playwright/test";

const html = [
  '<!doctype html>',
  '<html><head><style>.off{display:none}body{font:18px sans-serif}#second{margin-top:1000px}</style></head><body>',
  '<button id="advance" onclick="counter.textContent=String(Number(counter.textContent)+1)">Next</button><span id="counter">0</span>',
  '<p id="first">Same <b>phrase</b>.</p>',
  '<p id="revision">Head text.</p>',
  '<p id="second">Same <b>phrase</b>.</p>',
  '<details id="notes"><summary>Notes</summary>',
  '<p id="note">Read <a id="link" href="#destination">this guide</a>.</p>',
  '</details>',
  '<p id="hidden" class="off">Hidden target.</p>',
  '<p id="multi">',
  'Across <em>multiple</em>',
  'lines.',
  '</p>',
  '<p id="duplicate">Duplicate Duplicate</p>',
  '<p id="dynamic">Original text.</p>',
  '<h2 id="destination">Destination</h2>',
  '<script>window.scriptRuns=(window.scriptRuns||0)+1;window.linkClicks=0;link.addEventListener("click",()=>window.linkClicks++);</script>',
  '</body></html>',
].join('\n');
const frame = (page: Page) => page.frameLocator('iframe[title="deck.html"]');
async function setup(page: Page) {
  await page.addInitScript(() => localStorage.setItem("mardoc_github_token","fake"));
  const quote=(text:string,body:string)=>`> _"${text}"_\n\n${body}`;
  const comments = [
    {id:1,line:6,body:quote("Same phrase.","Repeated passage")},
    {id:2,line:5,side:"LEFT",body:quote("Base text.","Base passage")},
    {id:3,line:8,body:quote("this guide","Notes passage")},
    {id:4,line:10,body:quote("Hidden target.","Hidden passage")},
    {id:5,start_line:11,line:13,body:quote("Across multiple lines.","Multiline passage")},
    {id:6,line:15,body:quote("Duplicate","Ambiguous passage")},
    {id:7,line:16,body:quote("Original text.","Dynamic passage")},
    {id:8,line:null,subject_type:"file",body:"Whole file"},
    {id:9,line:null,original_line:6,body:quote("Same phrase.","Historical passage")},
    {id:10,line:6,side:null,body:quote("Same phrase.","Unknown passage")},
    {id:11,line:6,body:"Element range"},
    {id:12,line:6,body:quote("Missing text","Missing passage")},
  ].map(comment=>({path:"deck.html",side:"RIGHT",...comment,user:{login:"reviewer"},created_at:"2026-09-24T00:00:00Z"}));
  const pr={number:12,title:"HTML comment targets",state:"open",user:{login:"reviewer"},
    base:{ref:"main",sha:"a".repeat(40),repo:{full_name:"acme/docs"}},
    head:{ref:"topic",sha:"b".repeat(40),repo:{full_name:"acme/docs"}}};
  await page.route("https://api.github.com/**",async route=>{
    const url=new URL(route.request().url()), path=decodeURIComponent(url.pathname);
    const data=path.endsWith("/pulls/12/files") ? [{filename:"deck.html",status:"modified"}]
      : path.endsWith("/pulls/12/comments") ? comments
      : path.endsWith("/issues/12/comments") ? []
      : path==="/graphql" ? {data:{repository:{pullRequest:{reviewThreads:{nodes:[]}}}}}
      : path.includes("/contents/") ? {encoding:"base64",content:Buffer.from(url.searchParams.get("ref")==="a".repeat(40)?html.replace("Head text.","Base text."):html).toString("base64")}
      : pr;
    await route.fulfill({contentType:"application/json",body:JSON.stringify(data)});
  });
  await page.goto("/#/acme/docs/pull/12");
  await expect(page.getByRole("button",{name:"12 comments",exact:true})).toBeVisible();
  await expect(frame(page).locator("#second")).toHaveText("Same phrase.");
  await page.keyboard.press("Escape");
}
async function jump(page: Page, body: string, keyboard=false) {
  await page.getByRole("button",{name:"All PR comments (12)",exact:true}).click();
  const button=page.getByRole("region",{name:"PR comment navigator"}).locator("article").filter({hasText:body}).getByRole("button",{name:"Open comment in deck.html"});
  if (keyboard) {await button.focus(); await page.keyboard.press("Enter");}
  else await button.click();
}
const status = (page:Page, text:string) => page.getByRole("status").filter({hasText:text});

test("HTML jumps preserve document nodes, scripts, selection, links, and Source view state",async ({page})=>{
  await setup(page);
  await frame(page).getByRole("button",{name:"Next",exact:true}).click();
  await frame(page).locator("body").evaluate(() => {
    (window as any).savedSecond=document.querySelector("#second");
    (window as any).savedText=document.querySelector("#second")!.firstChild;
    const range=document.createRange(); range.selectNodeContents(document.querySelector("#first")!);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  });
  await jump(page,"Repeated passage",true);
  await expect(status(page,"Comment location highlighted.")).toBeVisible();
  await expect(frame(page).locator("#second")).toBeFocused();
  expect(await frame(page).locator("body").evaluate(()=>({same:(window as any).savedSecond===document.querySelector("#second"),text:(window as any).savedText===document.querySelector("#second")!.firstChild,
    selection:window.getSelection()!.toString(),runs:(window as any).scriptRuns,highlights:(CSS as any).highlights.get("mardoc-review-target").size})))
    .toEqual({same:true,text:true,selection:"Same phrase.",runs:1,highlights:3});
  await expect(frame(page).locator("#second")).toBeInViewport();
  // The selection-preservation assertion is complete. Clear it before clicking
  // inside the iframe, which intentionally opens MarDoc's selection prompt.
  await frame(page).locator("body").evaluate(()=>window.getSelection()!.removeAllRanges());
  await page.getByRole("button",{name:"Source Diff",exact:true}).click();
  await jump(page,"Notes passage");
  await expect(frame(page).locator("#notes")).toHaveAttribute("open","");
  await expect(frame(page).getByRole("link",{name:"this guide"})).toBeFocused();
  await frame(page).getByRole("link",{name:"this guide"}).click();
  expect(await frame(page).locator("body").evaluate(()=>(window as any).linkClicks)).toBe(1);
  await expect(frame(page).locator("#counter")).toHaveText("1");
  expect(await frame(page).locator("body").evaluate(()=>(window as any).savedSecond===document.querySelector("#second"))).toBe(true);
  await frame(page).getByRole("button",{name:"Next",exact:true}).click();
  await expect(frame(page).locator("#counter")).toHaveText("2");
  await jump(page,"Multiline passage");
  await expect(status(page,"Comment location highlighted.")).toBeVisible();
  await expect(frame(page).locator("#multi")).toBeFocused();
});

test("base/head jumps wait for the selected revision to load",async ({page})=>{
  await setup(page);
  await jump(page,"Base passage");
  await expect(status(page,"Comment location highlighted.")).toBeVisible();
  await expect(frame(page).locator("#revision")).toHaveText("Base text.");
  await expect(frame(page).locator("#revision")).toBeFocused();
  await jump(page,"Repeated passage");
  await expect(frame(page).locator("#revision")).toHaveText("Head text.");
  await expect(frame(page).locator("#second")).toBeFocused();
});

test("hidden, ambiguous, missing, historical, file and unknown targets have explicit feedback",async ({page})=>{
  await setup(page);
  for (const [body,message] of [["Hidden passage","passage is hidden"],["Ambiguous passage","More than one passage"],
    ["Missing passage","could not be located"],["Historical passage","older revision"],["Whole file","whole file"],["Unknown passage","enough location information"]]) {
    await jump(page,body);
    await expect(status(page,message)).toBeVisible();
  }
  await frame(page).locator("#hidden").evaluate(el=>el.classList.remove("off"));
  await jump(page,"Hidden passage");
  await expect(frame(page).locator("#hidden")).toBeFocused();
  await jump(page,"Element range");
  await expect(status(page,"Source element highlighted")).toBeVisible();
});

test("scripted text changes are verified against source and unsupported highlight APIs use an honest fallback",async ({page})=>{
  await setup(page);
  await frame(page).locator("#dynamic").evaluate(el=>el.textContent="Changed text.");
  await jump(page,"Dynamic passage");
  await expect(status(page,"could not be located")).toBeVisible();
  await frame(page).locator("#dynamic").evaluate(el=>el.textContent="Original text.");
  await jump(page,"Dynamic passage");
  await expect(frame(page).locator("#dynamic")).toBeFocused();
  await frame(page).locator("#dynamic").evaluate(el=>el.textContent="Updated again.");
  await expect(status(page,"highlighted passage changed")).toBeVisible();
  expect(await frame(page).locator("body").evaluate(()=>(CSS as any).highlights.has("mardoc-review-target"))).toBe(false);
  await frame(page).locator("body").evaluate(()=>Object.defineProperty(window,"Highlight",{value:undefined,configurable:true}));
  await jump(page,"Repeated passage");
  await expect(status(page,"containing elements")).toBeVisible();
  await expect(frame(page).locator("#second")).toBeFocused();
});


test("comment polling does not reload the iframe or replay a jump",async ({page})=>{
  await page.clock.install();
  await setup(page);
  await frame(page).getByRole("button",{name:"Next",exact:true}).click();
  await jump(page,"Repeated passage");
  await expect(status(page,"Comment location highlighted.")).toBeVisible();
  await frame(page).locator("body").evaluate(()=>{
    (window as any).pollDocument=document;
    (window as any).scrollCalls=0;
    const original=Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView=function(options){(window as any).scrollCalls++;original.call(this,options);};
  });
  const refresh = page.waitForRequest(request=>request.url().includes("/pulls/12/comments"));
  await page.clock.fastForward(31000);
  await refresh;
  await expect(frame(page).locator("#counter")).toHaveText("1");
  expect(await frame(page).locator("body").evaluate(()=>({same:(window as any).pollDocument===document,scrolls:(window as any).scrollCalls})))
    .toEqual({same:true,scrolls:0});
});

test("an iframe that navigated away reports why it cannot locate the comment",async ({page})=>{
  await setup(page);
  await frame(page).locator("body").evaluate(()=>{ window.location.href="about:blank"; });
  await expect.poll(()=>frame(page).locator("body").evaluate(()=>document.URL)).toBe("about:blank");
  await jump(page,"Repeated passage");
  await expect(status(page,"no longer showing the reviewed HTML document")).toBeVisible();
});
