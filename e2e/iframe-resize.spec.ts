import { test, expect } from "@playwright/test";

const sha = "a".repeat(40);
for (const view of ["standalone", "pr"] as const) {
  test(`${view} HTML batches mutation bursts and resizes expanded notes and late images`, async ({page}) => {
    await page.addInitScript(() => {
      localStorage.setItem("mardoc_github_token", "fake-test-token");
      (window as any).__resizeReads = 0;
      (window as any).__resizeMessages = 0;
      const original = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight")!;
      Object.defineProperty(Element.prototype, "scrollHeight", {configurable:true,get() {
        if (this === document.documentElement) (window as any).__resizeReads++;
        return original.get!.call(this);
      }});
      window.addEventListener("message", event => {
        if (event.data?.type === "mardoc-iframe-resize") (window as any).__resizeMessages++;
      });
    });
    const html = `<!doctype html><style>body{margin:0}#notes{height:1800px}img{display:block}</style>
      <h1 id="slide">Slide one</h1><button id="next" onclick="document.getElementById('slide').firstChild.data='Slide two'">Next</button>
      <button id="toggle" onclick="document.getElementById('notes').hidden=!document.getElementById('notes').hidden">Notes</button>
      <section id="notes" hidden>Presenter notes</section><img id="late"><p id="end">End of document</p>`;
    await page.route("https://api.github.com/**", async route => {
      const path=decodeURIComponent(new URL(route.request().url()).pathname);
      let data: unknown = {};
      if (path.includes("/contents/")) data={type:"file",encoding:"base64",content:Buffer.from(html).toString("base64")};
      else if (path.endsWith("/pulls/12")) data={number:12,title:"Deck",state:"open",created_at:"2026-09-23T00:00:00Z",user:{login:"reviewer"},base:{ref:"main",sha,repo:{full_name:"acme/docs"}},head:{ref:"topic",sha,repo:{full_name:"acme/docs"}}};
      else if (path.endsWith("/pulls/12/files")) data=[{filename:"deck.html",status:"added"}];
      else if (path.includes("/comments")) data=[];
      else if (path==="/graphql") data={data:{repository:{pullRequest:{reviewThreads:{nodes:[]}}}}};
      else if (path.includes("/git/trees/")) data={tree:[{path:"deck.html",type:"blob",sha}]};
      else if (path.includes("/commits/")) data={sha};
      else if (path.endsWith("/branches") || path.endsWith("/pulls")) data=[];
      else data={default_branch:"main"};
      await route.fulfill({contentType:"application/json",body:JSON.stringify(data)});
    });
    await page.goto(view === "pr" ? "/#/acme/docs/pull/12" : `/#/acme/docs/blob/${sha}/deck.html`);
    const iframe=page.locator('iframe[title="deck.html"]');
    const frame=page.frameLocator('iframe[title="deck.html"]');
    await expect(frame.getByRole("heading",{name:"Slide one"})).toBeVisible();
    // Let the preserved 100/500/2000 ms fallback checks settle before counting.
    await page.waitForTimeout(2300);
    await page.evaluate(() => { (window as any).__resizeMessages=0; });
    const reads=await iframe.evaluate(async element => {
      const win=(element as HTMLIFrameElement).contentWindow!;
      (win as any).__resizeReads=0;
      const slide=win.document.getElementById("slide")!;
      for(let i=0;i<50;i++) { slide.setAttribute("data-step",String(i)); await Promise.resolve(); }
      await new Promise<void>(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())));
      return (win as any).__resizeReads;
    });
    expect(reads).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as any).__resizeMessages)).toBeLessThanOrEqual(1);
    await frame.getByRole("button",{name:"Next",exact:true}).click();
    await expect(frame.getByRole("heading",{name:"Slide two"})).toBeVisible();
    await frame.getByRole("button",{name:"Notes",exact:true}).click();
    await expect.poll(() => iframe.evaluate(element => parseFloat((element as HTMLIFrameElement).style.height))).toBeGreaterThan(1800);
    await iframe.evaluate(element => {
      const doc=(element as HTMLIFrameElement).contentDocument!;
      (doc.getElementById("late") as HTMLImageElement).src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="700"></svg>');
    });
    await expect.poll(() => iframe.evaluate(element => parseFloat((element as HTMLIFrameElement).style.height))).toBeGreaterThan(2500);
    // The document's last content fits in its viewport (no clipped notes/image).
    await expect.poll(() => iframe.evaluate(element => {
      const win=(element as HTMLIFrameElement).contentWindow!;
      return win.document.getElementById("end")!.getBoundingClientRect().bottom <= win.innerHeight;
    })).toBe(true);
    await page.waitForTimeout(150);
    const height=await iframe.evaluate(element => (element as HTMLIFrameElement).style.height);
    await page.waitForTimeout(300);
    expect(await iframe.evaluate(element => (element as HTMLIFrameElement).style.height)).toBe(height);
    await frame.getByRole("button",{name:"Notes",exact:true}).click();
    await expect(frame.locator("#notes")).toBeHidden();
    await expect(frame.getByRole("button",{name:"Next",exact:true})).toBeVisible();
    console.log(`${view}: 50 mutation callbacks -> ${reads} scrollHeight read`);
  });
}
