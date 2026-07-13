// git 자동 초기화 — 새 프로젝트(project.created)의 루트에 .git 이 없으면 git 제공자의 init 명령을
// 실행한다(있으면 명령이 no-op, 멱등). 기존 명령+이벤트만 조합 — 자체 백엔드 0줄.
// C2 투명성(command 축): 뷰 없는 정책 플러그인도 커맨드 표면을 노출한다 —
// status(정책 관찰면: 무엇을 보고 어디에 위임하며 몇 번 실행했는가)와
// run(같은 위임 경로의 수동 실행, init 멱등이라 안전).
//
// git 은 직접 실행하지 않는다. soksak-spec-plugin-git 을 구현한 플러그인에게 위임하고, 그 플러그인은
// **계약으로 찾는다 — 이름으로 찾지 않는다**(C3 L2 계약-핀). 그래서 관찰면(status)이 보고하는
// 위임 대상은 두 층이다: 고정된 계약(contract)과, 지금 그 계약을 이행 중인 제공자(provider).
const EVENT = "project.created";
const GIT_CONTRACT = "soksak-spec-plugin-git";

export default {
  activate(ctx) {
    const app = ctx.app;

    // message·검증 에러는 사람 표면 — locale 해소({en,ko}, docs/I18N.md).
    // ko 외 locale 은 en 폴백. 호스트가 locale 을 안 주는 구버전은 ko 로 폴백.
    const msg = (en, ko) =>
      ((typeof app.locale === "function" ? app.locale() : "ko") === "ko" ? ko : en);

    // 계약 구현체 해소 — 매번 다시 묻는다(구현체는 런타임에 켜지고 꺼진다).
    // exec 를 받는 이유: 중첩 실행(inv.execute)은 유래·상관을 계승한다 — 발견도 같은 경로로 나간다.
    const providerOf = async (exec) => {
      const out = await exec("plugin.implementers", { contract: GIT_CONTRACT });
      if (!out?.ok) return null;
      const found = (out.data?.implementers ?? []).find((i) => i.status === "enabled");
      return found?.id ?? null;
    };

    const noProvider = () => ({
      ok: false,
      code: "NO_GIT_PROVIDER",
      message: msg(
        `no enabled plugin implements ${GIT_CONTRACT}`,
        `${GIT_CONTRACT} 을 구현한 활성 플러그인이 없습니다`,
      ),
    });

    // 정책 위임 — 제공자를 찾고 그 init 을 부른다. 제공자가 없으면 위임하지 않고 거부 봉투를
    // 돌려준다(장부에도 그 실패가 그대로 남는다 — 무음 스킵 금지).
    const delegateInit = async (exec, path) => {
      const id = await providerOf(exec);
      if (!id) return noProvider();
      return exec(`plugin.${id}.init`, { path });
    };

    // 정책 실행 장부(세션-로컬, 비영속) — status 가 반환하는 관찰면.
    // 정책 자체가 무상태 위임이라 영속할 상태가 없다. last 는 마지막 위임 결과 1건.
    const stats = { autoRuns: 0, manualRuns: 0, last: null };
    const record = (source, path, r) => {
      if (source === "auto") stats.autoRuns += 1;
      else stats.manualRuns += 1;
      stats.last = {
        source, // "auto"(이벤트) | "manual"(run 커맨드)
        path,
        ok: r.ok,
        code: r.code,
        // 성공 시 위임 응답의 initialized(실제 init 수행 여부, false=이미 저장소).
        initialized: r.ok ? r.data?.initialized === true : null,
        at: Date.now(),
      };
    };

    // 정책 본체 — 이벤트 관찰 → 제공자 init 위임(.git 존재 시 위임 명령이 no-op).
    const exec = (n, prm) => app.commands.execute(n, prm);
    ctx.subscriptions.push(
      app.events.on(EVENT, (p) => {
        if (!p || !p.root) return; // 루트 없는 프로젝트는 대상 아님
        void delegateInit(exec, p.root).then((r) => {
          record("auto", p.root, r);
          if (!r.ok) console.error("[soksak-git-init]", r.message);
        });
      }),
    );

    const reg = (name, spec) =>
      ctx.subscriptions.push(app.commands.register(name, spec));

    reg("status", {
      description:
        "Report the auto git init policy state: which event it observes, which contract it delegates to, which plugin currently implements that contract (null when none is enabled — the policy is then observing but cannot act), per-session run counts (auto via project.created, manual via run), and the last delegation result.",
      triggers: { ko: "자동 깃 초기화 정책 상태 조회 확인" },
      params: {},
      returns:
        "{ active, event, contract, provider, delegate, autoRuns, manualRuns, last: {source,path,ok,code,initialized,at}|null }",
      examples: ["sok plugin.soksak-plugin-git-init.status"],
      message: (d) =>
        d.provider
          ? msg(
              `Auto git init policy active — this session ran ${d.autoRuns} auto, ${d.manualRuns} manual.`,
              `자동 git init 정책 활성 — 이번 세션 자동 ${d.autoRuns}회·수동 ${d.manualRuns}회 실행.`,
            )
          : msg(
              `Auto git init policy is observing, but nothing implements ${GIT_CONTRACT} — it cannot act.`,
              `자동 git init 정책은 관찰 중이나 ${GIT_CONTRACT} 구현체가 없어 실행할 수 없습니다.`,
            ),
      handler: async (p, inv) => {
        const run = inv?.execute ?? exec;
        const provider = await providerOf(run);
        return {
          active: true, // 이 커맨드가 응답한다 = activate 가 구독을 배선했다
          event: EVENT,
          contract: GIT_CONTRACT,
          provider, // 지금 계약을 이행 중인 플러그인(없으면 null — 정책은 살아 있고 대상이 없다)
          delegate: provider ? `plugin.${provider}.init` : null,
          autoRuns: stats.autoRuns,
          manualRuns: stats.manualRuns,
          last: stats.last,
        };
      },
    });

    reg("run", {
      description:
        "Apply the git init policy to a directory now: delegates to the git provider's init, which initializes only when .git is absent (no-op otherwise, idempotent). Use for projects that existed before the policy or were created without a root event. The run is recorded in the policy status.",
      triggers: { ko: "깃 저장소 수동 초기화 지금 실행" },
      params: {
        path: {
          type: "string",
          required: true,
          description: "Target directory (absolute path)",
        },
      },
      returns: "{ initialized: whether init was performed, path }",
      examples: [
        'sok plugin.soksak-plugin-git-init.run \'{"path":"/Users/me/work"}\'',
      ],
      message: (d) =>
        d.initialized
          ? msg(
              `Initialized a git repository — ${d.path}`,
              `git 저장소를 초기화했습니다 — ${d.path}`,
            )
          : msg(
              `Already a git repository — ${d.path}`,
              `이미 git 저장소입니다 — ${d.path}`,
            ),
      handler: async (p, inv) => {
        const path =
          typeof p.path === "string" && p.path.trim() ? p.path : null;
        if (!path) {
          return {
            ok: false,
            code: "INVALID_PARAMS",
            message: msg(
              "path required — specify the target directory as an absolute path",
              "path 필요 — 대상 디렉토리 절대 경로를 지정하세요",
            ),
          };
        }
        // 중첩 실행은 inv.execute(유래·상관 상속) — 구버전 호스트만 app.commands.execute 폴백.
        const run = inv?.execute ?? exec;
        const r = await delegateInit(run, path);
        record("manual", path, r);
        if (!r.ok) return { ok: false, code: r.code, message: r.message };
        return { initialized: r.data?.initialized === true, path };
      },
    });
  },

  deactivate() {
    // 구독·커맨드는 ctx.subscriptions/호스트 tracker 가 자동 해제 — 별도 정리 없음.
  },
};
