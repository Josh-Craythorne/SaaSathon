import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assembleReport,
  type Project,
  type Visit,
  type Item,
  type Evidence,
} from "../lib/sitescribe";

export async function verifySiteScribe(
  alice: SupabaseClient,
  bob: SupabaseClient,
  anonymous: SupabaseClient,
  owners: string[],
) {
  const [a, b] = owners;
  const p = {
    user_id: a,
    name: "Isolation project",
    reference: "TEST",
    address: "Test site",
    client: "Test client",
  };
  const { data: project, error } = await alice
    .from("projects")
    .insert(p)
    .select()
    .single();
  assert.equal(error, null);
  const projectId = project.id;
  const { data: visit, error: ve } = await alice
    .from("visits")
    .insert({
      user_id: a,
      project_id: projectId,
      date: "2026-09-21",
      engineer: "Test engineer",
    })
    .select()
    .single();
  assert.equal(ve, null);
  const { data: bProject, error: bpe } = await bob
    .from("projects")
    .insert({ ...p, user_id: b })
    .select()
    .single();
  assert.equal(bpe, null);
  const { data: bVisit, error: bve } = await bob
    .from("visits")
    .insert({
      user_id: b,
      project_id: bProject.id,
      date: "2026-09-22",
      engineer: "Bob",
    })
    .select()
    .single();
  assert.equal(bve, null);
  const recording = {
    p_id: crypto.randomUUID(),
    p_visit: visit.id,
    p_digest: "a".repeat(64),
  };
  assert.ok(
    (await anonymous.rpc("begin_transcription", recording)).error,
    "Anonymous transcription denied",
  );
  assert.ok(
    (await bob.rpc("begin_transcription", recording)).error,
    "Cross-account transcription denied",
  );
  const reserved = await alice.rpc("begin_transcription", recording);
  assert.equal(reserved.error, null);
  assert.ok(reserved.data.lease);
  assert.ok(
    (await alice.rpc("begin_transcription", recording)).data.error,
    "Duplicate request held by lease",
  );
  await bob.rpc("finish_transcription", {
    p_id: recording.p_id,
    p_lease: reserved.data.lease,
    p_text: "Forged",
  });
  assert.ok(
    (await alice.rpc("begin_transcription", recording)).data.error,
    "Other account cannot release lease",
  );
  await alice.rpc("finish_transcription", {
    p_id: recording.p_id,
    p_lease: reserved.data.lease,
    p_text: null,
  });
  const retryLease = await alice.rpc("begin_transcription", recording);
  assert.ok(retryLease.data.lease, "Failed recording can retry");
  await alice.rpc("finish_transcription", {
    p_id: recording.p_id,
    p_lease: reserved.data.lease,
    p_text: "Stale",
  });
  assert.ok(
    (await alice.rpc("begin_transcription", recording)).data.error,
    "Stale completion cannot release newer lease",
  );
  await alice.rpc("finish_transcription", {
    p_id: recording.p_id,
    p_lease: retryLease.data.lease,
    p_text: "Reviewed later",
  });
  assert.equal(
    (await alice.rpc("begin_transcription", recording)).data.text,
    "Reviewed later",
    "Retry returns cached result",
  );
  assert.ok(
    (
      await alice.rpc("begin_transcription", {
        ...recording,
        p_digest: "b".repeat(64),
      })
    ).data.error,
    "ID cannot be reused for different audio",
  );
  for (let i = 0; i < 8; i++) {
    const p_id = crypto.randomUUID();
    const r = await alice.rpc("begin_transcription", { ...recording, p_id });
    assert.ok(r.data.lease);
    await alice.rpc("finish_transcription", {
      p_id,
      p_lease: r.data.lease,
      p_text: null,
    });
  }
  assert.match(
    (
      await alice.rpc("begin_transcription", {
        ...recording,
        p_id: crypto.randomUUID(),
      })
    ).data.error,
    /limit reached/,
  );
  console.log(
    "PASS: transcription anonymous/owner isolation, leases, failed retry, stale completion, cached deduplication and request limit",
  );
  const photo = `${a}/${crypto.randomUUID()}.png`;
  const png = await readFile("public/demo/foundation.png");
  assert.equal(
    (
      await alice.storage
        .from("sitescribe")
        .upload(photo, png, { contentType: "image/png" })
    ).error,
    null,
  );
  assert.ok(
    (await bob.storage.from("sitescribe").download(photo)).error,
    "Other account cannot read private media",
  );
  assert.ok((await anonymous.storage.from("sitescribe").download(photo)).error);
  assert.ok(
    (await bob.storage.from("sitescribe").createSignedUrl(photo, 60)).error,
    "Other account cannot mint private links",
  );
  assert.ok(
    (
      await bob.storage
        .from("sitescribe")
        .upload(`${a}/${crypto.randomUUID()}.png`, png, {
          contentType: "image/png",
        })
    ).error,
  );
  const signed = await alice.storage
    .from("sitescribe")
    .createSignedUrl(photo, 60);
  assert.equal(signed.error, null);
  assert.equal((await fetch(signed.data!.signedUrl)).status, 200);
  assert.ok(
    (
      await alice.storage
        .from("sitescribe")
        .update(photo, png, { contentType: "image/png" })
    ).error,
    "Original files cannot be overwritten",
  );
  const publicUrl = alice.storage.from("sitescribe").getPublicUrl(photo)
    .data.publicUrl;
  assert.equal((await fetch(publicUrl)).ok, false, "Bucket is private");
  const input = {
    request_id: crypto.randomUUID(),
    visit_id: visit.id,
    item_id: "",
    title: "Test item",
    raw_notes: "Engineer supplied note",
    category: "Structural",
    priority: "Routine",
    status: "Open",
    action_required: "Provide record",
    responsible: "Contractor",
    due_date: "2026-09-28",
    photo_path: photo,
    photo_marker: { x: 0.2, y: 0.8 },
    drawing_pin: null,
    location: "Grid A1",
  };
  const { data: itemId, error: oe } = await alice.rpc("save_observation", {
    p: input,
  });
  assert.equal(oe, null);
  const retry = await alice.rpc("save_observation", { p: input });
  assert.equal(retry.error, null);
  assert.equal(retry.data, itemId);
  const { data: item } = await alice
    .from("items")
    .select()
    .eq("id", itemId)
    .single();
  const { data: evidence } = await alice
    .from("evidence")
    .select()
    .eq("id", input.request_id)
    .single();
  const snapshot = assembleReport(
    project as Project,
    visit as Visit,
    [item as Item],
    [evidence as Evidence],
  );
  const { data: report, error: re } = await alice
    .from("reports")
    .insert({
      user_id: a,
      project_id: projectId,
      visit_id: visit.id,
      snapshot,
      state: "Reviewed",
      reviewed_at: new Date().toISOString(),
    })
    .select()
    .single();
  assert.equal(re, null);
  assert.equal(report.version, 1);
  const laterVersions = await Promise.all(
    [1, 2].map(() =>
      alice
        .from("reports")
        .insert({
          user_id: a,
          project_id: projectId,
          visit_id: visit.id,
          source_report_id: report.id,
          snapshot,
          state: "Draft",
        })
        .select()
        .single(),
    ),
  );
  assert.ok(laterVersions.every((r) => !r.error));
  assert.deepEqual(
    laterVersions.map((r) => r.data!.version).sort(),
    [2, 3],
    "Concurrent report versions are unique and ordered",
  );
  assert.ok(
    (
      await bob
        .from("reports")
        .insert({
          user_id: b,
          project_id: bProject.id,
          visit_id: bVisit.id,
          source_report_id: report.id,
          snapshot,
          state: "Draft",
        })
    ).error,
    "Cross-owner report source denied",
  );

  for (const [table, row] of [
    ["projects", project],
    ["visits", visit],
    ["items", item],
    ["evidence", evidence],
    ["reports", report],
  ] as const) {
    assert.equal(
      (await alice.from(table).select().eq("id", row.id)).data?.length,
      1,
      `${table}: owner read`,
    );
    assert.equal(
      (await bob.from(table).select().eq("id", row.id)).data?.length,
      0,
      `${table}: cross-account read`,
    );
    assert.ok(
      (await anonymous.from(table).select()).error,
      `${table}: anonymous read denied`,
    );
    const forged = { ...row, id: crypto.randomUUID() };
    delete forged.sequence;
    assert.ok(
      (await bob.from(table).insert(forged)).error,
      `${table}: forged owner denied`,
    );
    assert.ok(
      (await anonymous.from(table).insert(forged)).error,
      `${table}: anonymous insert denied`,
    );
    assert.ok(
      (await alice.from(table).update({ user_id: b }).eq("id", row.id)).error,
      `${table}: immutable owner`,
    );
    assert.ok(
      (await bob.from(table).delete().eq("id", row.id)).error,
      `${table}: delete denied`,
    );
  }
  assert.ok(
    (
      await bob.from("visits").insert({
        user_id: b,
        project_id: projectId,
        date: "2026-09-21",
        engineer: "Bob",
      })
    ).error,
    "Cross-owner project FK",
  );
  assert.ok(
    (
      await bob.from("items").insert({
        user_id: b,
        project_id: projectId,
        number: 1,
        title: "Forged parent",
      })
    ).error,
  );
  const invalidEvidence = {
    ...evidence,
    id: crypto.randomUUID(),
    user_id: b,
    project_id: bProject.id,
    visit_id: bVisit.id,
    photo_path: "",
  };
  delete invalidEvidence.sequence;
  assert.ok(
    (await bob.from("evidence").insert(invalidEvidence)).error,
    "Cross-owner item FK",
  );
  assert.ok(
    (
      await bob.from("reports").insert({
        user_id: b,
        project_id: bProject.id,
        visit_id: visit.id,
        snapshot,
        state: "Draft",
      })
    ).error,
    "Cross-owner report visit FK",
  );
  const { data: other } = await alice
    .from("projects")
    .insert({ ...p, name: "Other owned project" })
    .select()
    .single();
  const { data: otherVisit } = await alice
    .from("visits")
    .insert({
      user_id: a,
      project_id: other.id,
      date: "2026-09-23",
      engineer: "Alice",
    })
    .select()
    .single();
  assert.ok(
    (
      await alice.rpc("save_observation", {
        p: {
          ...input,
          request_id: crypto.randomUUID(),
          visit_id: otherVisit.id,
          item_id: itemId,
        },
      })
    ).error,
    "Same-owner cross-project item rejected",
  );
  const { data: nextVisit } = await alice
    .from("visits")
    .insert({
      user_id: a,
      project_id: projectId,
      date: "2026-09-24",
      engineer: "Alice",
    })
    .select()
    .single();
  assert.equal(
    (
      await alice.rpc("save_observation", {
        p: {
          ...input,
          request_id: crypto.randomUUID(),
          visit_id: nextVisit.id,
          item_id: itemId,
          status: "Resolved",
          raw_notes: "Engineer recorded resolution.",
        },
      })
    ).error,
    null,
  );
  assert.equal(
    (await alice.from("items").select().eq("project_id", projectId)).data
      ?.length,
    1,
    "Follow-up never duplicates item",
  );
  assert.equal(
    (await alice.from("evidence").select().eq("item_id", itemId)).data?.length,
    2,
  );
  assert.deepEqual(
    (
      await alice
        .from("reports")
        .select("snapshot")
        .eq("id", report.id)
        .single()
    ).data?.snapshot,
    snapshot,
    "Reviewed snapshot remains stable",
  );
  assert.ok(
    (await alice.from("reports").update({ snapshot: {} }).eq("id", report.id))
      .error,
    "Reports are append-only",
  );
  assert.ok(
    (
      await alice
        .from("evidence")
        .update({ raw_notes: "Overwrite" })
        .eq("id", evidence.id)
    ).error,
    "Evidence is append-only",
  );
  assert.equal(
    (
      await alice.rpc("save_observation", {
        p: {
          ...input,
          request_id: crypto.randomUUID(),
          visit_id: nextVisit.id,
          item_id: itemId,
          status: "Open",
          raw_notes: "Engineer reopened item.",
        },
      })
    ).error,
    null,
  );
  const reopened = await alice
    .from("evidence")
    .select()
    .eq("item_id", itemId)
    .order("sequence", { ascending: false })
    .limit(1);
  assert.equal(reopened.data?.[0].status, "Open");
  const demo = await alice.rpc("load_sitescribe_demo", {
    paths: [photo, photo, photo, photo],
  });
  assert.equal(demo.error, null);
  const demoAgain = await alice.rpc("load_sitescribe_demo", {
    paths: [photo, photo, photo, photo],
  });
  assert.equal(demoAgain.data, demo.data);
  assert.equal(
    (await alice.from("items").select().eq("project_id", demo.data)).data
      ?.length,
    3,
  );
  assert.equal(
    (await alice.from("visits").select().eq("project_id", demo.data)).data
      ?.length,
    2,
  );
  assert.equal(
    (
      await alice
        .from("projects")
        .update({ drawing_path: photo, drawing_reference: "TEST-D01 Rev A" })
        .eq("id", projectId)
    ).error,
    null,
  );
  const stale = await alice.rpc("save_observation", {
    p: {
      ...input,
      request_id: crypto.randomUUID(),
      item_id: itemId,
      expected_drawing_path: "",
      drawing_pin: { x: 0.5, y: 0.5 },
    },
  });
  assert.ok(
    stale.error?.message.includes("drawing changed"),
    "A pin cannot silently attach to a replaced drawing",
  );
  const pinned = await alice.rpc("save_observation", {
    p: {
      ...input,
      request_id: crypto.randomUUID(),
      item_id: itemId,
      expected_drawing_path: photo,
      drawing_pin: { x: 0.5, y: 0.5 },
    },
  });
  assert.equal(pinned.error, null);
  const concurrent = await Promise.all(
    [1, 2].map(() =>
      alice.rpc("save_observation", {
        p: {
          ...input,
          request_id: crypto.randomUUID(),
          visit_id: otherVisit.id,
        },
      }),
    ),
  );
  assert.ok(
    concurrent.every((r) => !r.error),
    "Concurrent captures succeed",
  );
  assert.deepEqual(
    (
      await alice
        .from("items")
        .select("number")
        .eq("project_id", other.id)
        .order("number")
    ).data?.map((i) => i.number),
    [1, 2],
  );
  assert.equal(
    (
      await bob
        .from("projects")
        .update({ drawing_reference: "Intrusion" })
        .eq("id", projectId)
        .select()
    ).data?.length,
    0,
  );
  assert.ok(
    (
      await alice.storage
        .from("sitescribe")
        .upload(`${a}/${crypto.randomUUID()}.png`, png, {
          contentType: "text/html",
        })
    ).error,
    "Bucket rejects unsupported MIME types",
  );
  assert.ok(
    (
      await alice.storage
        .from("sitescribe")
        .upload(
          `${a}/${crypto.randomUUID()}.png`,
          new Uint8Array(8 * 1024 * 1024 + 1),
          { contentType: "image/png" },
        )
    ).error,
    "Bucket enforces 8 MB limit",
  );
  console.log(
    "PASS: drawing replacement guard, concurrent reference allocation and storage MIME/size limits",
  );
  console.log(
    "PASS: SiteScribe five-table account isolation, private files, cross-owner/project FKs, append-only evidence, idempotent capture/demo, item continuity, resolve/reopen and snapshot stability",
  );
}
