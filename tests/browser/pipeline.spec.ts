import { test, expect } from "@playwright/test";
import { film } from "../../worker/tests/fixtures";
test("cloud studio preserves the original shell and project approval without calling manual ComfyUI APIs", async ({
  page,
}) => {
  let created = false,
    scripts: any[] = [],
    uploads: any[] = [],
    approval: any = null,
    approved = false,
    createdTitle = "";
  const project = {
    id: "p1",
    title: "Delivery project",
    revision: 0,
    approved_script_id: null,
    auto_episode: null,
  };
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname,
      body = req.method() === "POST" ? req.postDataJSON() : null;
    let data: any = {};
    if (path === "/api/capabilities") data = { manual: false, pipeline: true };
    else if (path === "/api/status") data = { gpu: [] };
    else if (path === "/api/projects" && body) {
      created = true;
      createdTitle = body.title;
      data = { id: "p1" };
    } else if (path === "/api/projects")
      data = { projects: created ? [project] : [] };
    else if (path === "/api/projects/p1/scripts") {
      uploads.push(body);
      scripts.unshift({
        id: "s1",
        kind: "raw",
        body: body.body,
        report_json: '{"issues":[]}',
        created_at: 1,
      });
      data = { versionId: "s1" };
    } else if (path === "/api/projects/p1/approve-script") {
      approved = true;
      approval = body;
      project.revision++;
      data = { ok: true };
    } else if (path === "/api/projects/p1/logs") data = [];
    else if (path === "/api/projects/p1")
      data = {
        project,
        scripts,
        assets: approved
          ? [
              {
                id: "ada",
                ref: "ada",
                kind: "character",
                name: "Ada",
                status: "draft",
                spec_json: JSON.stringify({ fields: { FACE: "round face" } }),
              },
            ]
          : [],
        assetVersions: [],
        episodes: [],
        scenes: [],
        clips: [],
        jobs: [],
        renders: [],
      };
    else if (path.startsWith("/api/comfy/"))
      throw new Error("Cloud studio must not call manual ComfyUI routes");
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  // The cloud studio opens on Projects; the original Generate shell is still one click away.
  await expect(
    page.getByRole("heading", { name: "Drama pipeline" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Parameters", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  // One upload creates the project, named from the script TITLE, and saves the script.
  await page.getByLabel("Upload a script as a new project").setInputFiles({
    name: "synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(film),
  });
  // Upload saves at once and asks for repair, since the fixture has a W01 warning.
  await expect.poll(() => scripts.length).toBe(1);
  expect(createdTitle).toBe(film.match(/^TITLE: (.*)$/m)![1]);
  expect(uploads[0].fix).toBe(true);
  expect(uploads[0].autoApprove).toBe(true);
  // The mock leaves the script unapproved, so the guide asks for the one manual click.
  await expect(page.getByText("This script version is not approved yet.")).toBeVisible();
  await page
    .getByRole("button", { name: "Approve script", exact: true })
    .click();
  await expect.poll(() => approved).toBe(true);
  expect(approval.generateAssets).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Cast, props & locations" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ada", exact: true }),
  ).toBeVisible();
});

test('unreliable speech is shown as review rather than a below-threshold render failure',async({page})=>{
  await page.route('**/api/**',async(route)=>{
    const path=new URL(route.request().url()).pathname;
    const project={id:'speech-review',title:'Speech review',revision:1,approved_script_id:'script',auto_episode:null};
    let data:any={};
    if(path==='/api/capabilities')data={manual:false,pipeline:true};
    else if(path==='/api/status')data={gpu:[]};
    else if(path==='/api/projects')data={projects:[project]};
    else if(path==='/api/projects/speech-review/logs')data=[];
    else if(path==='/api/projects/speech-review')data={
      project,scripts:[{id:'script',kind:'raw',body:film,report_json:'{}'}],assets:[],assetVersions:[],episodes:[{number:0,title:'Film'}],
      scenes:[{id:'scene',number:1,episode_number:0,duration:8,approved_clip_id:null,spec_json:JSON.stringify({title:'A greeting',fields:{},shots:[]})}],
      clips:[{id:'take',scene_id:'scene',take:1,status:'review',params_json:'{}',qa_json:JSON.stringify({score:80,threshold:75,pass:false,needsOwnerReview:true,issues:['ASR repeated the same word excessively']})}],jobs:[],renders:[],
    };
    await route.fulfill({json:data});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Scenes',exact:true}).click();
  await expect(page.getByText('QA 80% · speech review needed',{exact:true})).toBeVisible();
  await expect(page.getByText('QA 80% · below 75%',{exact:true})).toHaveCount(0);
});
