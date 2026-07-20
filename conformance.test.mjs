// 커맨드 표면 conformance — C2 투명성 3종의 command 축 검사.
// 이 플러그인은 뷰 없는 정책 플러그인이다: project.created 를 관찰해 git 라이브러리 플러그인 init 에 위임한다.
// 기능(이벤트 구독·위임)이 실존하므로 커맨드 표면 0 은 C2 위반 — 정책의 관찰면(status)과
// 수동 실행(run)을 헤드리스 커맨드로 노출해야 한다.
// 검사 축: ① 매니페스트 선언(기능>0 → commands>0, "commands" 권한)
//          ② 선언 ≡ 등록 양방향(plugin.json contributes.commands ↔ activate 실등록)
//          ③ 스펙 의무 필드(description·ko triggers·examples·message — T-법 T1)
//          ④ 핸들러 동작(정책 장부 반영·git-core init 위임 관통, 실패는 {ok:false,code,message})
// 실행: node --test (앱 불요 — 호스트 API 는 mock).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(
  readFileSync(new URL("./plugin.json", import.meta.url), "utf8"),
);
const plugin = (await import("./main.js")).default;

const MIN_SURFACE = ["status", "run"]; // 위생 최소 표면 — 정책 상태 조회 + 수동 실행

// 이 플러그인은 git 제공자를 **계약으로** 찾는다(soksak-spec-plugin-git) — 이름으로 찾지 않는다.
// 그래서 시험이 제공자의 id 를 정하고, 그 id 는 일부러 git-core 가 아니다: 코드에 구현체 이름이
// 박혀 있으면 아래 시험은 통과할 수 없다.
const CONTRACT = "soksak-spec-plugin-git";
const PROVIDER = "soksak-plugin-any-git";
const INIT = `plugin.${PROVIDER}.init`;
const ENABLED = [{ id: PROVIDER, version: "1.0.0", status: "enabled" }];

// activate 를 mock 호스트로 구동 — 등록 커맨드 스펙·이벤트 구독·위임 호출을 수확한다.
// executed 에는 제공자 명령만 남는다(발견 호출은 discovery 축에).
function activateWithMock(opts = {}) {
  const registered = new Map();
  const events = new Map();
  const executed = [];
  const discovery = [];
  const implementers = opts.implementers ?? ENABLED;
  const exec = async (name, params) => {
    if (name === "plugin.implementers") {
      discovery.push(params);
      return { ok: true, code: "OK", message: "", data: { contract: params?.id, implementers } };
    }
    executed.push([name, params]);
    return opts.execute
      ? opts.execute(name, params)
      : {
          ok: true,
          code: "OK",
          message: "",
          data: { initialized: true, path: params?.path },
        };
  };
  const app = {
    locale: () => opts.locale ?? "en",
    commands: {
      register: (name, spec) => {
        registered.set(name, spec);
        return { dispose() {} };
      },
      execute: exec,
    },
    events: {
      on: (name, cb) => {
        events.set(name, cb);
        return { dispose() {} };
      },
    },
  };
  plugin.activate({ app, subscriptions: [] });
  return { registered, events, executed, discovery };
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

test("status: 초기 상태 — 정책 활성·관찰 이벤트·계약과 해소된 제공자·실행 0회", async () => {
  const { registered, discovery } = activateWithMock();
  const out = await registered.get("status").handler({});
  assert.equal(out.active, true);
  assert.equal(out.event, "project.created");
  // 관찰면은 무엇에 위임하는지 말한다 — 계약(고정)과 지금 그 계약을 이행 중인 제공자(가변).
  assert.equal(out.contract, CONTRACT);
  assert.equal(out.provider, PROVIDER);
  assert.equal(out.delegate, INIT);
  assert.deepEqual(discovery, [{ id: CONTRACT }]);
  assert.equal(out.autoRuns, 0);
  assert.equal(out.manualRuns, 0);
  assert.equal(out.last, null);
});

test("status: 구현체 0 → provider·delegate 는 null, 정책은 여전히 관찰 중", async () => {
  const { registered } = activateWithMock({ implementers: [] });
  const out = await registered.get("status").handler({});
  assert.equal(out.active, true);
  assert.equal(out.contract, CONTRACT);
  assert.equal(out.provider, null);
  assert.equal(out.delegate, null);
});

test("run: 구현체 0 → loud 거부(NO_GIT_PROVIDER)·위임 0회", async () => {
  const { registered, executed } = activateWithMock({ implementers: [] });
  const out = await registered.get("run").handler({ path: "/tmp/x" });
  assert.equal(out.ok, false);
  assert.equal(out.code, "NO_GIT_PROVIDER");
  assert.ok(out.message.includes(CONTRACT));
  assert.equal(executed.length, 0, "제공자 없이 위임 호출 금지");
});

test("이벤트 발화 → 위임 실행 + status 장부 반영 (source=auto)", async () => {
  const { registered, events, executed } = activateWithMock();
  events.get("project.created")({ root: "/tmp/proj" });
  await flush();
  assert.deepEqual(executed[0], [INIT, { path: "/tmp/proj" }]);
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

test("run: 제공자 init 위임 관통(inv.execute 우선) — {initialized,path} 반환 + 장부(source=manual)", async () => {
  const { registered } = activateWithMock();
  const nested = [];
  const inv = {
    execute: async (name, params) => {
      if (name === "plugin.implementers") {
        return { ok: true, code: "OK", message: "", data: { implementers: ENABLED } };
      }
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
  assert.deepEqual(nested[0], [INIT, { path: "/tmp/x" }]);
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

// i18n 두 축(docs/I18N.md): 사람 표면(message·검증 에러)은 로케일 해소({en,ko}),
// LLM 표면(param description)은 영어 base — 로케일 무관 한글 금지.
// locale=en 에서 한글 리터럴이 새어 나오면 해소 없이 하드코딩됐다는 뜻 — 위반.
const HANGUL = /[가-힣]/;

test("i18n: locale=en — message·검증 에러에 한글 없음, param description 은 영어 base", async () => {
  const { registered } = activateWithMock({ locale: "en" });

  const status = registered.get("status");
  const statusMsg = status.message({ autoRuns: 2, manualRuns: 1 });
  assert.ok(!HANGUL.test(statusMsg), `status.message 에 한글 리터럴: ${statusMsg}`);

  const run = registered.get("run");
  const initMsg = run.message({ initialized: true, path: "/tmp/x" });
  assert.ok(!HANGUL.test(initMsg), `run.message(initialized) 에 한글 리터럴: ${initMsg}`);
  const existMsg = run.message({ initialized: false, path: "/tmp/x" });
  assert.ok(!HANGUL.test(existMsg), `run.message(already) 에 한글 리터럴: ${existMsg}`);

  const bad = await run.handler({});
  assert.equal(bad.code, "INVALID_PARAMS");
  assert.ok(!HANGUL.test(bad.message), `run INVALID_PARAMS message 에 한글 리터럴: ${bad.message}`);

  const desc = run.params?.path?.description ?? "";
  assert.ok(desc.length > 0, "run.params.path.description 누락");
  assert.ok(!HANGUL.test(desc), `run.params.path.description(LLM 표면) 에 한글 리터럴: ${desc}`);
});
