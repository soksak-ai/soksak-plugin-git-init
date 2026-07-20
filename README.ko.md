# soksak-plugin-git-init

새 프로젝트의 루트에 `.git` 이 없으면 자동으로 `git init` 하는 soksak
플러그인. 기존 이벤트(`project.created`)와 기존 명령만 조합한다 —
자체 백엔드 0줄, 자체 git 0줄.

## 동작

프로젝트가 생성되면(`project.created`) 루트를 **`soksak-spec-plugin-git`** 구현체의 `init` 명령에
넘긴다. `.git` 이 이미 있으면 no-op(멱등).

## 커맨드

정책의 상태와 수동 실행 지점을 헤드리스 커맨드로 노출한다.

```bash
sok plugin.soksak-plugin-git-init.status   # 정책 상태: 관찰 이벤트·위임 명령·실행 횟수·마지막 결과
sok plugin.soksak-plugin-git-init.run '{"path":"/Users/me/work"}'   # 지금 이 디렉토리에 정책 적용
```

- `status` 는 `{ active, event, contract, provider, delegate, autoRuns, manualRuns, last }` 를 반환한다.
  `contract` 는 고정, `provider` 는 지금 그 계약을 이행 중인 플러그인(없으면 null), `delegate` 는 그 제공자의 명령이다.
  `last` 는 마지막 위임 결과(`source` 가 `auto` 면 이벤트 발동, `manual` 이면 `run`).
- `run` 은 `path` 필수, 제공자의 `init` 에 위임한다(`.git` 없을 때만 초기화). 실행은 정책
  상태에 기록된다.

git 제공자는 **계약으로 찾는다 — 이름으로 찾지 않는다** — 발견은
`plugin.implementers { id: "soksak-spec-plugin-git" }`(계약 identity, 버전-free)로 부르고 활성 구현체를 취한다.
구현체가 바뀌어도 이 플러그인은 그대로다. 활성 구현체가 없으면 정책은 계속 관찰하되 loud 하게
거부한다(`NO_GIT_PROVIDER`) — 무음 스킵이 아니다. 그때 `status` 는 `provider: null` 을 보고한다
("할 일이 없다"와 "할 사람이 없다"의 차이).

매니페스트는 `consumes: ["soksak-spec-plugin-git"]` 를 선언한다 — 계약-핀의 소비자 축이다. 호스트의 호출
게이트가 그 선언을 읽으므로 **이 플러그인 어디에도 구현체의 플러그인 id 가 없다**: 코드에도, 매니페스트에도.

## 테스트

```bash
node --test   # 커맨드 표면 conformance + 정책 동작(mock 호스트, 앱 불요)
```

## 권한

- `commands` — 제공자의 `init` 명령 실행 + 자기 커맨드 등록
