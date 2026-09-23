import { test, expect, type Page } from "@playwright/test";

const A = "a".repeat(40), B = "b".repeat(40);
const branch = "feature/report";
const filePath = "docs/spec.md";
const shared = `/#/acme/docs/blob/${encodeURIComponent(branch)}/${filePath}`;

async function mockGitHub(page: Page) {
  let revision = A;
  const reads: {path:string;ref:string|null}[] = [];
  const commits: string[] = [];
  const metadata: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("mardoc_github_token", "fake-test-token");
    Object.defineProperty(navigator, "clipboard", { configurable: true,
      value: { writeText: async (text: string) => { (window as any).__copiedLink = text; } } });
  });
  await page.route("https://raw.githubusercontent.com/**", route => route.abort());
  await page.route("https://api.github.com/**", async route => {
    const url = new URL(route.request().url());
    const path = decodeURIComponent(url.pathname);
    if (path.endsWith("/branches") || path.endsWith("/pulls") || path === "/graphql") metadata.push(path);
    let data: unknown;
    if (path.includes("/commits/")) {
      commits.push(path); data = {sha:revision};
    } else if (path.includes("/contents/")) {
      const file = path.split("/contents/")[1]; const ref=url.searchParams.get("ref");
      reads.push({path:file,ref});
      const text = file.endsWith(".svg")
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="${ref===A?'red':'blue'}"/></svg>`
        : `# ${ref===A?'First':'Updated'} branch report\n\n![Diagram](./diagram.svg)\n\nReview this version.`;
      data = { encoding:"base64", content:Buffer.from(text).toString("base64") };
    } else if (path.includes("/git/trees/")) {
      data = {tree:[{path:"docs",type:"tree",sha:"dir"},{path:filePath,type:"blob",sha:"blob"}]};
    } else if (path.endsWith("/branches")) {
      data = [{name:"main"},{name:branch}];
    } else if (path.endsWith("/pulls")) {
      data = [];
    } else if (path === "/repos/acme/docs") {
      data = {default_branch:"main"};
    } else {
      await route.fulfill({status:404,contentType:"application/json",body:JSON.stringify({message:`Unexpected fixture request: ${path}`})}); return;
    }
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
  });
  return {reads,commits,metadata,advance:()=>{revision=B;}};
}

test("shared branch link renders once, refreshes text and image together, and shares a pinned revision", async ({page}) => {
  await page.addInitScript(() => localStorage.setItem("mardoc_profile", "1"));
  const fixture=await mockGitHub(page);
  await page.goto(shared);
  await expect(page.locator(".ProseMirror h1")).toHaveText("First branch report");
  await expect(page.locator(".ProseMirror img")).toHaveAttribute("src",/^data:image\/svg\+xml;base64,/);
  expect(fixture.reads.filter(r=>r.path===filePath)).toEqual([{path:filePath,ref:A}]);
  expect(fixture.commits).toEqual(["/repos/acme/docs/commits/feature/report"]);
  const timings = await page.evaluate(() => performance.getEntriesByType("measure")
    .filter(entry => entry.name.startsWith("mardoc:"))
    .map(entry => ({name:entry.name, duration:entry.duration})));
  expect(timings.some(entry => entry.name === "mardoc:document-fetch")).toBe(true);
  console.log("Synthetic cold branch timings (ms)", timings);
  expect(fixture.metadata).toEqual([]);
  await expect(page).toHaveURL(new RegExp("feature%2Freport/docs/spec.md$"));
  await page.getByRole("button",{name:"Copy branch link"}).click();
  expect(await page.evaluate(()=>(window as any).__copiedLink)).toContain("feature%2Freport/docs/spec.md");
  fixture.advance();
  await page.getByRole("button",{name:"Refresh document",exact:true}).click();
  await expect(page.locator(".ProseMirror h1")).toHaveText("Updated branch report");
  const newImage=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>').toString("base64");
  await expect(page.locator(".ProseMirror img")).toHaveAttribute("src",`data:image/svg+xml;base64,${newImage}`);
  expect(fixture.reads.filter(r=>r.path==="docs/diagram.svg").map(r=>r.ref)).toEqual([A,B]);
  await page.getByRole("button",{name:"Copy revision link"}).click();
  const pinned=await page.evaluate(()=>(window as any).__copiedLink);
  expect(pinned).toContain(`/blob/${B}/docs/spec.md`);
  await page.goto(pinned);
  await expect(page.locator(".ProseMirror h1")).toHaveText("Updated branch report");
  await expect(page.getByRole("button",{name:"Copy branch link"})).toHaveCount(0);
});

test("a large HTML PR deep link loads the requested HTML file without relying on the PR list",async({page})=>{
  const fixture = await mockGitHub(page);
  const pr={number:381,title:"Training deck",state:"open",created_at:"2026-09-23T00:00:00Z",body:"Training",
    user:{login:"reviewer"},base:{ref:"main",sha:A,repo:{full_name:"acme/docs"}},head:{ref:branch,sha:B,repo:{full_name:"acme/docs"}}};
  await page.route("https://api.github.com/repos/acme/docs/pulls/381**", async route=>{
    const path=new URL(route.request().url()).pathname;
    const data=path.endsWith("/files")?[{filename:"docs/intro.md",status:"added"},{filename:"docs/overview.md",status:"added"},{filename:"docs/deck.html",status:"added"}]:path.endsWith("/comments")?[]:pr;
    await route.fulfill({contentType:"application/json",body:JSON.stringify(data)});
  });
  await page.route("https://api.github.com/repos/acme/docs/issues/381/comments**",route=>route.fulfill({contentType:"application/json",body:"[]"}));
  await page.route("https://api.github.com/graphql",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({data:{repository:{pullRequest:{reviewThreads:{nodes:[]}}}}})}));
  await page.route("https://api.github.com/repos/acme/docs/contents/docs*deck.html**",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({type:"file",encoding:"none",content:"",sha:B})}));
  const deck = '<html><body><h1 id="title">Loading</h1><script>document.getElementById("title").textContent="Training slide one"</script><!--' + "x".repeat(1_100_000) + '--></body></html>';
  await page.route("https://api.github.com/repos/acme/docs/git/blobs/**",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({encoding:"base64",content:Buffer.from(deck).toString("base64")})}));
  await page.goto("/#/acme/docs/pull/381/files/2");
  await expect(page.frameLocator("iframe").locator("h1")).toHaveText("Training slide one");
  await expect(page).toHaveURL(/#\/acme\/docs\/pull\/381\/files\/2$/);
  expect(fixture.reads).toEqual([]); // Unselected Markdown bodies were never requested.
});


test("sidebar requests lists only when their controls are opened", async ({page, isMobile}) => {
  const fixture = await mockGitHub(page);
  await page.goto(shared);
  await expect(page.locator(".ProseMirror h1")).toHaveText("First branch report");
  expect(fixture.metadata).toEqual([]);
  if (isMobile) await page.getByRole("button", {name:"Open navigation"}).click();
  await page.getByRole("button", {name:branch, exact:true}).click();
  await expect(page.getByRole("button", {name:"main", exact:false})).toBeVisible();
  expect(fixture.metadata).toEqual(["/repos/acme/docs/branches"]);
  await page.getByRole("button", {name:"PRs", exact:true}).click();
  await expect(page.getByText("No pull requests found.")).toBeVisible();
  expect(fixture.metadata).toEqual(["/repos/acme/docs/branches", "/repos/acme/docs/pulls"]);
});
