/** Local-only, real Supabase + HTTP smoke test. Never accepts a remote project. */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { createClient } from "@supabase/supabase-js";
import { load } from "cheerio";
import { verifySiteScribe } from "./sitescribe-integration";
const pnpm = process.env.npm_execpath!;

async function main() {
  const local = JSON.parse(
    execFileSync(process.execPath, [pnpm, "supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  assert.equal(
    new URL(local.API_URL).hostname,
    "127.0.0.1",
    "Only the local Supabase stack is allowed",
  );
  assert.equal(
    new URL(local.API_URL).port,
    "55431",
    "Use this starter's isolated test stack",
  );
  const key = local.PUBLISHABLE_KEY || local.ANON_KEY;
  const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const publicClient = () =>
    createClient(local.API_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const alice = publicClient();
  const bob = publicClient();
  const anonymous = publicClient();
  const userIds: string[] = [];
  const run = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const aliceEmail = `alice-${run}@example.test`;
  const bobEmail = `bob-${run}@example.test`;
  let server: ReturnType<typeof spawn> | undefined;
  try {
    for (const [client, email] of [
      [alice, aliceEmail],
      [bob, bobEmail],
    ] as const) {
      const password = `local-only-${run}-Password1!`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      assert.equal(error, null);
      userIds.push(data.user!.id);
      assert.equal(
        (await client.auth.signInWithPassword({ email, password })).error,
        null,
      );
    }
    const { data: record, error } = await alice
      .from("ideas")
      .insert({
        title: "Private test idea",
        description: "Owner only",
        user_id: userIds[0],
      })
      .select()
      .single();
    assert.equal(error, null);
    assert.equal(
      (await alice.from("ideas").select().eq("id", record.id)).data?.length,
      1,
    );
    assert.equal(
      (await bob.from("ideas").select().eq("id", record.id)).data?.length,
      0,
    );
    assert.ok(
      (await anonymous.from("ideas").select()).error,
      "Anonymous reads are denied",
    );
    assert.ok(
      (
        await anonymous
          .from("ideas")
          .insert({ title: "Anonymous", user_id: userIds[0] })
      ).error,
    );
    assert.ok(
      (
        await bob
          .from("ideas")
          .insert({ title: "Forged owner", user_id: userIds[0] })
      ).error,
    );
    assert.equal(
      (
        await bob
          .from("ideas")
          .update({ title: "Intrusion" })
          .eq("id", record.id)
          .select()
      ).data?.length,
      0,
    );
    assert.equal(
      (await bob.from("ideas").delete().eq("id", record.id).select()).data
        ?.length,
      0,
    );
    assert.ok(
      (
        await alice
          .from("ideas")
          .update({ user_id: userIds[1] })
          .eq("id", record.id)
      ).error,
      "Ownership is immutable",
    );
    assert.ok(
      (await alice.from("ideas").insert({ title: "   ", user_id: userIds[0] }))
        .error,
    );
    assert.ok(
      (
        await alice.from("ideas").insert({
          title: "Too long",
          description: "x".repeat(2001),
          user_id: userIds[0],
        })
      ).error,
    );
    assert.equal(
      (
        await alice
          .from("ideas")
          .update({ title: "Updated" })
          .eq("id", record.id)
      ).error,
      null,
    );
    assert.equal(
      (await alice.from("ideas").select().eq("id", record.id).single()).data
        ?.title,
      "Updated",
    );
    assert.equal(
      (await alice.from("ideas").delete().eq("id", record.id)).error,
      null,
    );
    assert.equal(
      (await alice.from("ideas").select().eq("id", record.id)).data?.length,
      0,
    );
    console.log(
      "PASS: database CRUD, anonymous denial, cross-account isolation, immutable ownership and DB validation",
    );

    await verifySiteScribe(alice, bob, anonymous, userIds);
    const env = {
      ...process.env,
      OPENAI_API_KEY: "test-placeholder-never-used",
      NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
    };
    execFileSync(process.execPath, [pnpm, "build"], { env, stdio: "pipe" });
    const portProbe = createServer();
    portProbe.listen(0, "127.0.0.1");
    await once(portProbe, "listening");
    const address = portProbe.address();
    assert.ok(address && typeof address === "object");
    const port = address.port;
    await new Promise<void>((resolve) => portProbe.close(() => resolve()));
    server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      { env, stdio: "ignore" },
    );
    const origin = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(origin)).ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const cookies = new Map<string, string>();
    async function request(path: string, init: RequestInit = {}) {
      const response = await fetch(`${origin}${path}`, {
        ...init,
        redirect: "manual",
        headers: {
          Cookie: [...cookies]
            .map(([name, value]) => `${name}=${value}`)
            .join("; "),
          Origin: origin,
          ...init.headers,
        },
      });
      for (const cookie of response.headers.getSetCookie()) {
        const [part] = cookie.split(";");
        const i = part.indexOf("=");
        cookies.set(part.slice(0, i), part.slice(i + 1));
      }
      return response;
    }
    async function submit(
      path: string,
      html: string,
      selector: string,
      fields: Record<string, string>,
    ) {
      const $ = load(html);
      const form = $(selector).first();
      assert.ok(form.length, `Missing form ${selector}`);
      const body = new FormData();
      form.find('input[type="hidden"]').each((_, input) => {
        body.append($(input).attr("name")!, $(input).attr("value") ?? "");
      });
      for (const [name, value] of Object.entries(fields)) body.set(name, value);
      return request(path, { method: "POST", body });
    }
    assert.equal(
      (await request("/api/transcribe", { method: "POST" })).status,
      401,
    );
    let response = await request("/ideas");
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "/login");
    const login = await (await request("/login")).text();
    response = await submit("/login", login, "form", { email: aliceEmail });
    const sentHtml = await response.text();
    assert.ok(
      sentHtml.includes("Check your email"),
      "OTP request succeeds through the real Server Action",
    );
    const inbox = local.MAILPIT_URL || local.INBUCKET_URL;
    async function getCode(email: string) {
      let code = "";
      for (let attempt = 0; attempt < 30 && !code; attempt++) {
        const messages = await (await fetch(`${inbox}/api/v1/messages`)).json();
        const message = messages.messages?.find(
          (item: { To: { Address: string }[] }) =>
            item.To.some((to) => to.Address === email),
        );
        if (message) {
          const body = await (
            await fetch(`${inbox}/api/v1/message/${message.ID}`)
          ).json();
          code = String(body.Text || body.HTML).match(/\b\d{6}\b/)?.[0] ?? "";
        }
        if (!code) await new Promise((resolve) => setTimeout(resolve, 200));
      }
      assert.ok(code, "Sign-in email contains a code");
      return code;
    }
    const code = await getCode(aliceEmail);
    response = await submit(
      "/login",
      sentHtml,
      'form:has(input[name="code"])',
      { email: aliceEmail, code },
    );
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/projects");
    let html = await (await request("/projects/new")).text();
    response = await submit(
      "/projects/new",
      html,
      'form:has(input[name="name"])',
      {
        name: "HTTP construction project",
        reference: "HTTP-01",
        address: "Test site",
        client: "Test client",
      },
    );
    assert.equal(response.status, 303);
    const projectPath = response.headers.get("location")!;
    assert.ok(projectPath.startsWith("/projects/"));
    html = await (await request(projectPath)).text();
    assert.ok(html.includes("HTTP construction project"));
    html = await (await request(projectPath + "/visits/new")).text();
    response = await submit(
      projectPath + "/visits/new",
      html,
      'form:has(input[name="engineer"])',
      {
        date: "2026-09-26",
        engineer: "HTTP Engineer",
        weather: "Fine",
        scope: "Visual visit",
        limitations: "Accessible work only",
      },
    );
    assert.equal(response.status, 303);
    const visitPath = response.headers.get("location")!;
    const audioHeaders = {
      "Content-Type": "audio/wav",
      "x-recording-id": crypto.randomUUID(),
      "x-visit-id": visitPath.split("/").at(-1)!,
    };
    assert.equal(
      (
        await request("/api/transcribe", {
          method: "POST",
          headers: { ...audioHeaders, Origin: "https://invalid.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/api/transcribe", {
          method: "POST",
          headers: { ...audioHeaders, "x-recording-id": "bad" },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/api/transcribe", {
          method: "POST",
          headers: { ...audioHeaders, "Content-Type": "text/html" },
        })
      ).status,
      413,
    );
    assert.equal(
      (
        await request("/api/transcribe", {
          method: "POST",
          headers: { ...audioHeaders, "x-visit-id": crypto.randomUUID() },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request("/api/transcribe", {
          method: "POST",
          headers: audioHeaders,
          body: new Uint8Array(3840045),
        })
      ).status,
      413,
    );
    assert.equal(
      (
        await request("/api/transcribe", {
          method: "POST",
          headers: audioHeaders,
          body: "invalid audio",
        })
      ).status,
      400,
    );
    console.log(
      "PASS: transcription HTTP authentication, origin, identifiers, visit ownership and upload type/size/content validation (no provider request)",
    );
    const { data: reportItem, error: reportItemError } = await alice.rpc(
      "save_observation",
      {
        p: {
          request_id: crypto.randomUUID(),
          visit_id: visitPath.split("/").at(-1),
          item_id: "",
          title: "Recorded test finding",
          raw_notes: "Original engineer note, unchanged.",
          category: "Structural",
          priority: "Routine",
          status: "Open",
          action_required: "Provide the recorded test document.",
          responsible: "Test contractor",
          due_date: "2026-10-02",
          photo_path: "",
          photo_marker: null,
          drawing_pin: null,
          location: "Grid A1",
        },
      },
    );
    assert.equal(reportItemError, null);
    html = await (await request(visitPath)).text();
    assert.ok(html.includes("HTTP Engineer"));
    response = await submit(
      visitPath,
      html,
      'form:has(input[name="visit_id"])',
      {},
    );
    assert.equal(response.status, 303);
    const reportPath = response.headers.get("location")!;
    html = await (await request(reportPath)).text();
    assert.ok(html.includes("Information not recorded"));
    const draftSourceHtml = html;
    const reviewedEdits = {
      summary: "Engineer reviewed summary",
      closing: "Recorded next step: obtain the listed document.",
      [`prose_${reportItem}`]:
        "Engineer-edited finding, preserved in the reviewed snapshot.",
      intent: "review",
      reviewed: "on",
    };
    const invalidReview = await submit(
      reportPath,
      html,
      'form:has(textarea[name="summary"])',
      { ...reviewedEdits, reviewed: "" },
    );
    assert.equal(invalidReview.status, 200);
    assert.ok(
      (await invalidReview.text()).includes("Confirm you have reviewed"),
    );
    response = await submit(
      reportPath,
      draftSourceHtml,
      'form:has(textarea[name="summary"])',
      reviewedEdits,
    );
    assert.equal(response.status, 303);
    const reviewedPath = response.headers.get("location")!;
    assert.match(reviewedPath, /\/reports\/[0-9a-f-]+\/view\?saved=1$/);
    const reviewedId = reviewedPath.split("/").at(-2)!;
    assert.notEqual(reviewedId, reportPath.split("/").at(-1));
    html = await (await request(reviewedPath)).text();
    const reviewedDom = load(html);
    assert.equal(
      reviewedDom("#report-preview").attr("data-report-id"),
      reviewedId,
    );
    assert.equal(
      reviewedDom("#report-preview").attr("data-review-status"),
      "Reviewed",
    );
    assert.equal(
      reviewedDom("textarea").length,
      0,
      "Reviewed destination has no editor",
    );
    assert.deepEqual(
      reviewedDom("#report-preview > section > h3").map((_, el) => reviewedDom(el).text()).get(),
      [
        "1. Executive summary",
        "2. Visit scope and conditions",
        "3. Recorded observations and evidence",
        "4. Follow-up progress",
        "5. Consolidated action register",
        "6. Closing summary and outstanding information",
      ],
      "Saved snapshot renders the complete document structure",
    );
    assert.equal(reviewedDom(".report-actions tbody tr").length, 1);
    assert.ok(html.includes("Reviewed snapshot saved."));
    assert.ok(
      html.includes("Print / Save as PDF") &&
        html.includes("Back to project") &&
        html.includes("Create new draft"),
    );
    const reviewedRecord = await alice
      .from("reports")
      .select()
      .eq("id", reviewedId)
      .single();
    assert.equal(reviewedRecord.data?.state, "Reviewed");
    assert.equal(reviewedRecord.data?.version, 2);
    assert.equal(reviewedRecord.data?.snapshot.summary, reviewedEdits.summary);
    assert.equal(
      reviewedRecord.data?.snapshot.observations[0].prose,
      reviewedEdits[`prose_${reportItem}`],
    );
    assert.equal(
      reviewedRecord.data?.snapshot.observations[0].evidence.raw_notes,
      "Original engineer note, unchanged.",
    );
    const duplicate = await submit(
      reportPath,
      draftSourceHtml,
      'form:has(textarea[name="summary"])',
      reviewedEdits,
    );
    assert.equal(
      duplicate.headers.get("location"),
      reviewedPath,
      "Retry returns exact saved snapshot",
    );
    assert.equal(
      (
        await alice
          .from("reports")
          .select("id")
          .eq("visit_id", reviewedRecord.data!.visit_id)
      ).data?.length,
      2,
    );
    const changedRetry = await submit(
      reportPath,
      draftSourceHtml,
      'form:has(textarea[name="summary"])',
      { ...reviewedEdits, summary: "Conflicting retry" },
    );
    assert.equal(
      changedRetry.status,
      200,
      "Conflicting retry cannot claim old snapshot contains new edits",
    );
    assert.ok(
      (await changedRetry.text()).includes("Your edits are still here"),
    );
    const legacyDestination = await request(reviewedPath.split("/view")[0]);
    // App Router can stream the shell before the authenticated read completes.
    // In that case redirect() emits a meta refresh instead of an HTTP Location.
    const legacyHtml = load(await legacyDestination.text());
    assert.equal(
      legacyDestination.headers.get("location") ??
        legacyHtml('meta[http-equiv="refresh"]').attr("content")?.split("url=")[1],
      reviewedPath.split("?")[0],
      "Reviewed editor URL redirects to read-only view",
    );
    response = await submit(
      reviewedPath,
      html,
      'form:has(input[name="request_id"])',
      {},
    );
    assert.equal(response.status, 303);
    const copiedDraftPath = response.headers.get("location")!;
    const copiedDraft = await alice
      .from("reports")
      .select()
      .eq("id", copiedDraftPath.split("/").at(-1))
      .single();
    assert.equal(copiedDraft.data?.state, "Draft");
    assert.equal(copiedDraft.data?.source_report_id, reviewedId);
    assert.equal(copiedDraft.data?.version, 3);
    assert.deepEqual(
      copiedDraft.data?.snapshot,
      reviewedRecord.data?.snapshot,
      "New draft initially copies exact reviewed snapshot",
    );
    const draftCopyRetry = await submit(
      reviewedPath,
      html,
      'form:has(input[name="request_id"])',
      {},
    );
    assert.equal(draftCopyRetry.headers.get("location"), copiedDraftPath);
    const copiedHtml = await (await request(copiedDraftPath)).text();
    response = await submit(
      copiedDraftPath,
      copiedHtml,
      'form:has(textarea[name="summary"])',
      { ...reviewedEdits, summary: "Later draft summary", intent: "draft" },
    );
    assert.equal(response.status, 303);
    const draftHtml = await (
      await request(response.headers.get("location")!)
    ).text();
    assert.ok(draftHtml.includes("DRAFT · Engineer review required"));
    assert.deepEqual(
      (await alice.from("reports").select().eq("id", reviewedId).single()).data,
      reviewedRecord.data,
      "Later draft leaves entire reviewed version unchanged",
    );
    const forbiddenEdit = await submit(
      copiedDraftPath,
      copiedHtml,
      'form:has(textarea[name="summary"])',
      { ...reviewedEdits, id: reviewedId },
    );
    assert.ok(
      (await forbiddenEdit.text()).includes("reviewed snapshot is locked"),
    );
    console.log(
      "PASS: exact reviewed destination/status, explicit confirmation, retained edited prose, duplicate-save idempotency, locked view and immutable later-draft workflow",
    );
    html = await (await request("/projects")).text();
    response = await submit("/projects", html, "header form", {});
    assert.equal(response.status, 303);
    assert.equal(
      (await request("/projects")).headers.get("location"),
      "/login",
    );
    const newcomerEmail = `new-${run}@example.test`;
    const signupHtml = await (
      await submit("/login", await (await request("/login")).text(), "form", {
        email: newcomerEmail,
      })
    ).text();
    const { data: registered } = await admin.auth.admin.listUsers();
    const newcomer = registered.users.find(
      (user) => user.email === newcomerEmail,
    );
    assert.ok(newcomer, "First sign-in registers an account");
    userIds.push(newcomer.id);
    const signupCode = await getCode(newcomerEmail);
    const verifiedSignup = await submit(
      "/login",
      signupHtml,
      'form:has(input[name="code"])',
      { email: newcomerEmail, code: signupCode },
    );
    assert.equal(verifiedSignup.status, 303);
    assert.ok(
      (await (await request("/projects")).text()).includes(
        "Your first site starts here.",
      ),
    );
    console.log(
      "PASS: first-time email-code signup and empty private workspace",
    );
    console.log(
      "PASS: production HTTP sign-in email/code, session cookies, protected route, project creation, visit creation, report generation/review/edit/snapshot preservation and sign-out",
    );
  } finally {
    server?.kill("SIGTERM");
    for (const id of userIds) {
      const { data: files } = await admin.storage.from("sitescribe").list(id);
      if (files?.length)
        await admin.storage
          .from("sitescribe")
          .remove(files.map((f) => `${id}/${f.name}`));
      await admin.auth.admin.deleteUser(id);
    }
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Integration test failed",
  );
  process.exitCode = 1;
});
