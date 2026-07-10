// 커맨드 표면 conformance — C2 투명성 3종의 command 축 검사.
// 이 플러그인은 뷰 없는 정책 플러그인이다: project.created 를 관찰해 git.init 에 위임한다.
// 기능(이벤트 구독·위임)이 실존하므로 커맨드 표면 0 은 C2 위반 — 정책의 관찰면(status)과
// 수동 실행(run)을 헤드리스 커맨드로 노출해야 한다.
// 검사 축: ① 매니페스트 선언(기능>0 → commands>0, "commands" 권한)
//          ② 선언 ≡ 등록 양방향(plugin.json contributes.commands ↔ activate 실등록)
//          ③ 스펙 의무 필드(description·ko triggers·examples·message — T-법 T1)
//          ④ 핸들러 동작(정책 장부 반영·git.init 위임 관통, 실패는 {ok:false,code,message})
// 실행: node --test (앱 불요 — 호스트 API 는 mock).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(
  readFileSync(new URL("./plugin.json", import.meta.url), "utf8"),
);
const plugin = (await import("./main.js")).default;

const MIN_SURFACE = ["status", "run"]; // 위생 최소 표면 — 정책 상태 조회 + 수동 실행

// activate 를 mock 호스트로 구동 — 등록 커맨드 스펙·이벤트 구독·위임 호출을 수확한다.
function activateWithMock(opts = {}) {
  const registered = new Map();
  const events = new Map();
  const executed = [];
  const app = {
    commands: {
      register: (name, spec) => {
        registered.set(name, spec);
        return { dispose() {} };
      },
      execute: async (name, params) => {
        executed.push([name, params]);
        return opts.execute
          ? opts.execute(name, params)
          : {
              ok: true,
              code: "OK",
              message: "",
              data: { initialized: true, path: params?.path },
            };
      },
    },
    events: {
      on: (name, cb) => {
        events.set(name, cb);
        return { dispose() {} };
      },
    },
  };
  plugin.activate({ app, subscriptions: [] });
  return { registered, events, executed };
}

// 이벤트 핸들러의 위임 체인(execute().then(기록))이 microtask 로 끝난다 — 한 틱 흘려보낸다.
const flush = () => new Promise((r) => setImmediate(r));

test("C2: 기능 플러그인은 커맨드 표면을 선언한다 (contributes.commands > 0)", () => {
  const commands = manifest.contributes?.commands ?? [];
  assert.ok(
    commands.length > 0,
    "기능(이벤트 구독·위임)이 있는데 contributes.commands 가 비어 있다 — C2 위반(명령 없는 기능은 에이전트에게 존재하지 않는다)",
  );
  assert.ok(
    (manifest.permissions ?? []).includes("commands"),
    'contributes.commands 에는 "commands" 권한 선언이 필요하다',
  );
});

test("기능 실존: 정책은 project.created 를 관찰한다 (C2 위반의 '기능' 쪽 증거)", () => {
  const { events } = activateWithMock();
  assert.ok(
    events.has("project.created"),
    "project.created 구독이 없다 — 정책 기능 자체가 사라졌다",
  );
});

test("최소 표면: status(정책 상태)·run(수동 실행)", () => {
  const { registered } = activateWithMock();
  for (const name of MIN_SURFACE) {
    assert.ok(registered.has(name), `커맨드 '${name}' 미등록`);
  }
});

test("선언 ≡ 등록 — 양방향 (매니페스트 ↔ activate)", () => {
  const declared = (manifest.contributes?.commands ?? []).map((c) => c.name);
  const { registered } = activateWithMock();
  assert.deepEqual(
    [...registered.keys()].sort(),
    [...declared].sort(),
    "선언과 실등록이 다르다(missing/orphan)",
  );
});

test("스펙 의무 필드 — description·ko triggers·examples·message·handler", () => {
  const { registered } = activateWithMock();
  assert.ok(registered.size > 0, "등록된 커맨드가 없다");
  for (const [name, spec] of registered) {
    assert.ok(
      typeof spec.description === "string" && spec.description.length > 0,
      `${name}: description(영어 base) 필요`,
    );
    assert.ok(
      typeof spec.triggers?.ko === "string" && spec.triggers.ko.length > 0,
      `${name}: ko triggers 필요`,
    );
    assert.ok(
      Array.isArray(spec.examples) && spec.examples.length > 0,
      `${name}: examples 1개 이상 필요`,
    );
    assert.ok(typeof spec.message === "function", `${name}: message 함수 필요`);
    assert.ok(typeof spec.handler === "function", `${name}: handler 필요`);
  }
});

test("status: 초기 상태 — 정책 활성·관찰 이벤트·위임 명령·실행 0회", async () => {
  const { registered } = activateWithMock();
  const out = await registered.get("status").handler({});
  assert.equal(out.active, true);
  assert.equal(out.event, "project.created");
  assert.equal(out.delegate, "git.init");
  assert.equal(out.autoRuns, 0);
  assert.equal(out.manualRuns, 0);
  assert.equal(out.last, null);
});

test("이벤트 발화 → 위임 실행 + status 장부 반영 (source=auto)", async () => {
  const { registered, events, executed } = activateWithMock();
  events.get("project.created")({ root: "/tmp/proj" });
  await flush();
  assert.deepEqual(executed[0], ["git.init", { path: "/tmp/proj" }]);
  const out = await registered.get("status").handler({});
  assert.equal(out.autoRuns, 1);
  assert.equal(out.manualRuns, 0);
  assert.equal(out.last?.source, "auto");
  assert.equal(out.last?.path, "/tmp/proj");
  assert.equal(out.last?.ok, true);
  assert.equal(out.last?.initialized, true);
});

test("이벤트: 루트 없는 프로젝트는 대상 아님 — 위임 0회·장부 불변", async () => {
  const { registered, events, executed } = activateWithMock();
  events.get("project.created")({});
  await flush();
  assert.equal(executed.length, 0, "루트 없는 프로젝트에 위임 호출 금지");
  const out = await registered.get("status").handler({});
  assert.equal(out.autoRuns, 0);
  assert.equal(out.last, null);
});

test("run: path 누락 → {ok:false, code:INVALID_PARAMS} 봉투·위임 0회", async () => {
  const { registered, executed } = activateWithMock();
  const out = await registered.get("run").handler({});
  assert.equal(out.ok, false);
  assert.equal(out.code, "INVALID_PARAMS");
  assert.ok(typeof out.message === "string" && out.message.length > 0);
  assert.equal(executed.length, 0, "검증 실패 시 위임 호출 금지");
});

test("run: git.init 위임 관통(inv.execute 우선) — {initialized,path} 반환 + 장부(source=manual)", async () => {
  const { registered } = activateWithMock();
  const nested = [];
  const inv = {
    execute: async (name, params) => {
      nested.push([name, params]);
      return {
        ok: true,
        code: "OK",
        message: "",
        data: { initialized: true, path: params.path },
      };
    },
  };
  const out = await registered.get("run").handler({ path: "/tmp/x" }, inv);
  assert.deepEqual(nested[0], ["git.init", { path: "/tmp/x" }]);
  assert.equal(out.initialized, true);
  assert.equal(out.path, "/tmp/x");
  const st = await registered.get("status").handler({});
  assert.equal(st.manualRuns, 1);
  assert.equal(st.last?.source, "manual");
});

test("run: 위임 실패 → {ok:false,code,message} 그대로 수렴 + 장부에 실패 기록", async () => {
  const { registered } = activateWithMock({
    execute: async () => ({
      ok: false,
      code: "TARGET_NOT_FOUND",
      message: "대상 없음",
    }),
  });
  const out = await registered.get("run").handler({ path: "/none" });
  assert.equal(out.ok, false);
  assert.equal(out.code, "TARGET_NOT_FOUND");
  assert.ok(typeof out.message === "string" && out.message.length > 0);
  const st = await registered.get("status").handler({});
  assert.equal(st.last?.ok, false);
  assert.equal(st.last?.code, "TARGET_NOT_FOUND");
});
